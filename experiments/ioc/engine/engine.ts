import * as ts from "typescript";
import * as fs from "fs";

interface Options {
  debug: boolean;
}

// TODO: This is global variable. It's at risk of mutation.
const portRegistry = {};
let initialPort = 3000;

function compile(
  fileNames: string[],
  options: ts.CompilerOptions,
  generatorOptions: Options
): void {
  const universe = {};

  console.log("Compiling file name: " + fileNames[0]);
  let program = ts.createProgram(fileNames, options);
  const sourceFile = program.getSourceFile(fileNames[0]);

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

  Object.keys(universe).forEach(serviceName => {
    const directory = `./build/${serviceName}`;
    if (!fs.existsSync(directory)) {
      fs.mkdir(directory, { recursive: true }, err => {});
    }
    generateService(serviceName, directory);
    generateClientStub(serviceName, directory);
  });

  function generateService(serviceName: string, directory: string) {
    const serverFilePath = directory + "/app.ts";
    const stream = fs.createWriteStream(serverFilePath, {
      flags: "w+"
    });
    stream.on("error", function(err) {
      console.log("e: ", err);
    });
    console.log(`Writing to file ${serverFilePath}`);

    // Begin generating file.
    const serviceDefinition = universe[serviceName];
    print(stream, `// Express.js application for service '${serviceName}'`);
    print(stream, "import * as express from 'express';");

    const filePath = serviceDefinition.sourceFile.fileName;
    // This ia fault assumption. Does not handle filename with multiple '.'.
    const importPath = filePath.split(".")[0];
    print(stream, `import {${serviceName}} from '../../${importPath}';`);

    // Import modules of dependencies.
    serviceDefinition.dependencies.forEach(dependency => {
      const mod = (sourceFile as any).resolvedModules.get(
        importPaths[dependency]
      );
      // TODO: Compute relative path, based on build destination.
      const absoluteFilePath = mod.resolvedFileName;
      // TODO: unsafe, assumes single '.'.
      const importPath = absoluteFilePath.split(".")[0];
      print(stream, `import {${dependency}} from '${importPath}'`);
    });

    print(stream, "const app = express();");
    print(stream, "app.use(express.json());");

    let port = initialPort;
    while (portRegistry[port]) {
      port++;
    }
    console.log(`Assigning port ${port} to service ${serviceName}`);
    portRegistry[port] = serviceName;
    print(stream, `const port = ${port};`);

    // Instantiate service dependencies.
    let constructorParams = [];
    serviceDefinition.dependencies.forEach(dependency => {
      console.log("Instantiating parent service: " + dependency);
      console.log(
        "Relative path of parent service: " + importPaths[dependency]
      );
      const fileName = importPaths[dependency].slice(2);
      const dependencyFilePath = "src/" + fileName + ".ts";
      console.log("Recursively compiling with filename: ", dependencyFilePath);
      compile(
        [dependencyFilePath],
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

      // TODO: Instantiate depdendencie's dependencies.
      print(stream, `const _${dependency} =  new ${dependency}();`);
      constructorParams.push("_" + dependency);
    });

    // Instantiate service, with dependencies.
    print(
      stream,
      `const service = new ${serviceName}(${constructorParams.join(",")});`
    );

    Object.keys(serviceDefinition.methods).forEach(methodName => {
      print(stream, `app.post('/${methodName}', (req, res) => {`);
      if (generatorOptions.debug) {
        print(stream, `  console.log(req);`);
      }
      print(stream, `  const response = service.${methodName}(req.body);`);
      print(stream, `  res.send(response);`);
      print(stream, "});");
    });
    print(
      stream,
      "app.listen(port, () => console.log(`Example app listening on port ${port}!`));"
    );

    stream.end();
  }

  function generateClientStub(serviceName: string, directory: string) {
    const clientFilePath = directory + "/client.ts";
    const stream = fs.createWriteStream(clientFilePath, {
      flags: "w+"
    });
    stream.on("error", function(err) {
      console.log("e: ", err);
    });
    console.log(`Writing to file ${clientFilePath}`);

    print(stream, `class ${serviceName}Client {`);
    print(stream, `  constructor() {}`);

    const serviceDefinition = universe[serviceName];
    Object.keys(serviceDefinition.methods).forEach(methodName => {
      // TODO: This assumes every service's method has exactly one paramater.
      const params = "a: any";

      print(stream, `  ${methodName}(${params}) {`);
      // TODO: Resolve to HTTP call.
      print(stream, `    throw Error("Unimplemented");`);
      print(stream, "  }");
    });

    print(stream, "}");
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

  function print(stream, line) {
    if (!stream) {
      throw Error("Stream does not exist");
    }
    stream.write(line + "\n");
  }
}

const entryPoint = process.argv.slice(2);
compile(
  entryPoint,
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
