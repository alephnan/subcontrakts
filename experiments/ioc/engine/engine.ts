import * as ts from "typescript";
import * as fs from "fs";

interface Options {
  debug: boolean;
}

function compile(
  fileNames: string[],
  options: ts.CompilerOptions,
  generatorOptions: Options
): void {
  let program = ts.createProgram(fileNames, options);
  const sourceFile = program.getSourceFile(fileNames[0]);

  const universe = {};
  // Loop through the root AST nodes of the file.
  ts.forEachChild(sourceFile, node => {
    if (node.kind == ts.SyntaxKind.ClassDeclaration) {
      const serviceName = validateServiceRegistration(node, universe);
      const serviceDefinition = {
        methods: getMethodsDefinition(node),
        sourceFile
      };
      console.log(`Registering service '${serviceName}'`);
      console.log(`\tService definition: ${serviceDefinition}`);
      universe[serviceName] = serviceDefinition;
    }
  });

  emit(universe);

  function emit(universe: any) {
    Object.keys(universe).forEach(serviceName => {
      const serviceDefinition = universe[serviceName];

      print(`// Express.js application for service '${serviceName}'`);
      print("import * as express from 'express';");

      const filePath = serviceDefinition.sourceFile.fileName;
      // This ia fault assumption. Does not handle filename with multiple '.'.
      const importPath = filePath.split(".")[0];
      print(`import {${serviceName}} from '../${importPath}';`);

      print("const app = express();");
      print("app.use(express.json());");
      print("const port = 3000;");
      print(`const service = new ${serviceName}();`);

      Object.keys(serviceDefinition.methods).forEach(methodName => {
        print(`app.post('/${methodName}', (req, res) => {`);
        if (generatorOptions.debug) {
          print(`  console.log(req);`);
        }
        print(`  const response = service.${methodName}(req.body);`);
        print(`  res.send(response);`);
        print("});");
      });
      print(
        "app.listen(port, () => console.log(`Example app listening on port ${port}!`));"
      );
    });
    stream.end();
  }

  function validateServiceRegistration(node: ts.Node, universe: any) {
    const serviceName = (<ts.ClassDeclaration>node).name.escapedText as string;
    if (universe[serviceName]) {
      throw Error(`Service '${serviceName}' already defined.`);
    }
    return serviceName;
  }

  function getMethodsDefinition(node: ts.Node) {
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

  let stream;
  function print(s) {
    if (!stream) {
      stream = fs.createWriteStream("build/app.ts");
      console.log("Writing to file app.ts");
    }
    stream.write(s + "\n");
  }
}

compile(
  process.argv.slice(2),
  {
    noEmitOnError: true,
    noImplicitAny: true,
    target: ts.ScriptTarget.ES5,
    module: ts.ModuleKind.CommonJS
  },
  {
    debug: true
  }
);
