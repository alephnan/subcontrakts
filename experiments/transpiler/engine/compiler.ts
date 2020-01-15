import * as ts from "typescript";

function compile(fileNames: string[], options: ts.CompilerOptions): void {
  let program = ts.createProgram(fileNames, options);
  const sourceFile = program.getSourceFile(fileNames[0]);
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

  const universe = {};

  // Loop through the root AST nodes of the file.
  ts.forEachChild(sourceFile, node => {
    if (node.kind == ts.SyntaxKind.ClassDeclaration) {
      const serviceName = validateServiceRegistration(node, universe);
      const serviceDefinition = getServiceDefinition(node);
      console.log(`Registering service '${serviceName}'`);
      console.log(`\tService definition: ${serviceDefinition}`);
      universe[serviceName] = serviceDefinition;
    }
  });

  console.log("====== Outputting ======");
  emit(universe);

  function emit(universe: any) {
    Object.keys(universe).forEach(serviceName => {
      console.log("servicename" + serviceName);
      print(`// Express.js application for service '${serviceName}'`);
      print("const express = require('express');");
      print("const app = express();");
      print("const port = 3000;");
      const serviceDefinition = universe[serviceName];
      Object.keys(serviceDefinition).forEach(methodName => {
        const methodDeclaration = serviceDefinition[methodName];
        print(`app.get('/${methodName}', (req, res) =>`);
        transformAndEmitHandler(methodDeclaration);
        print(");");
      });
      print(
        "app.listen(port, () => console.log(`Example app listening on port ${port}!`));"
      );
    });
  }

  function transformAndEmitHandler(node: ts.MethodDeclaration) {
    const returnStatementTransformerFactory = context => {
      const visit: ts.Visitor = node => {
        if (node.kind == ts.SyntaxKind.ReturnStatement) {
          const callExpression = ts.createCall(
            ts.createPropertyAccess(
              ts.createIdentifier("res"),
              ts.createIdentifier("send")
            ),
            null,
            [(<ts.ReturnStatement>node).expression]
          );
          const callStatement = ts.createExpressionStatement(callExpression);
          return callStatement;
        }

        return ts.visitEachChild(node, child => visit(child), context);
      };

      return node => ts.visitNode(node, visit);
    };
    const result = ts.transform(node.body, [returnStatementTransformerFactory]);
    if (result.transformed[0]) {
      node.body = result.transformed[0];
    }
    print(printer.printNode(ts.EmitHint.Unspecified, node.body, sourceFile));
  }

  function validateServiceRegistration(node: ts.Node, universe: any) {
    const serviceName = (<ts.ClassDeclaration>node).name.escapedText as string;
    if (universe[serviceName]) {
      throw Error(`Service '${serviceName}' already defined.`);
    }
    return serviceName;
  }

  function getServiceDefinition(node: ts.Node) {
    const methods = {};
    ts.forEachChild(node, child => {
      if (child.kind == ts.SyntaxKind.MethodDeclaration) {
        const methodName = ((<ts.MethodDeclaration>child).name as ts.Identifier)
          .escapedText as string;
        if (methods[methodName]) {
          throw Error(`Method '${methodName} ' already defined.`);
        }
        methods[methodName] = child;
      }
    });

    return methods;
  }

  function print(s) {
    // TODO: Write to file.
    console.log(s);
  }
}

compile(process.argv.slice(2), {
  noEmitOnError: true,
  noImplicitAny: true,
  target: ts.ScriptTarget.ES5,
  module: ts.ModuleKind.CommonJS
});
