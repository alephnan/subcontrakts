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
      const methods = getMethodsDefinition(node);
      const dependencies = getDependencies(node);
      const serviceDefinition = {
        methods,
        sourceFile,
        dependencies
      };
      console.log(`Registering service '${serviceName}'`);
      console.log(`\tService definition: ${serviceDefinition}`);
      universe[serviceName] = serviceDefinition;
    }
  });

  console.log("");
  console.log("Getting import identifiers");
  const importPaths = {};
  ts.forEachChild(sourceFile, node => {
    if (node.kind == ts.SyntaxKind.ImportDeclaration) {
      const moduleSpecifier = (<ts.ImportDeclaration>node).moduleSpecifier;
      const namedBindings = (<ts.ImportDeclaration>node).importClause
        .namedBindings;
      const bindings = (<ts.NamedImports>namedBindings).elements;
      bindings.forEach(binding => {
        const specifier = (<ts.ImportSpecifier>binding).name;
        const className = (<ts.Identifier>specifier).escapedText;
        importPaths[className as string] = (<ts.StringLiteral>(
          moduleSpecifier
        )).text;
      });
    }
  });
  console.log("importPaths: ", importPaths);

  console.log("");
  console.log("Resolving dependencies");
  ts.forEachChild(sourceFile, node => {
    if (node.kind == ts.SyntaxKind.ClassDeclaration) {
      const serviceName = (<ts.ClassDeclaration>node).name
        .escapedText as string;

      universe[serviceName].dependencies.forEach(dependency => {
        console.log("Looking up dependency: " + dependency);
        console.log("via import: ", importPaths[dependency]);
        const mod = (sourceFile as any).resolvedModules.get(
          importPaths[dependency]
        );
        console.log("From module:", mod);
        console.log("With resolved filename: " + mod.resolvedFileName);
      });
    }
  });
  // TODO: recursively walk up dependency graph.

  console.log(universe);

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

      // Import modules of dependencies.
      serviceDefinition.dependencies.forEach(dependency => {
        const mod = (sourceFile as any).resolvedModules.get(
          importPaths[dependency]
        );
        // TODO: Compute relative path, based on build destination.
        const absoluteFilePath = mod.resolvedFileName;
        // TODO: unsafe, assumes single '.'.
        const importPath = absoluteFilePath.split(".")[0];
        print(`import {${dependency}} from '${importPath}'`);
      });

      print("const app = express();");
      print("app.use(express.json());");
      print("const port = 3000;");

      // Instantiate service dependencies.
      let constructorParams = [];
      serviceDefinition.dependencies.forEach(dependency => {
        // TODO: Instantiate depdendencie's dependencies.
        print(`const _${dependency} =  new ${dependency}();`);
        constructorParams.push("_" + dependency);
      });

      // Instantiate service, with dependencies.
      print(
        `const service = new ${serviceName}(${constructorParams.join(",")});`
      );

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

  function getDependencies(node: ts.Node): string[] {
    const dependencies = [];
    ts.forEachChild(node, child => {
      if (child.kind == ts.SyntaxKind.Constructor) {
        ts.forEachChild(child, grandChild => {
          if (grandChild.kind == ts.SyntaxKind.Parameter) {
            // Assumes the dependency is a service and class.
            const type = (<ts.ParameterDeclaration>grandChild).type;
            const typeName = (<ts.TypeReferenceNode>type).typeName;
            const className = (<ts.Identifier>typeName).escapedText;
            const dependentServiceName = className;
            dependencies.push(dependentServiceName);
          }
        });
      }
    });
    return dependencies;
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
