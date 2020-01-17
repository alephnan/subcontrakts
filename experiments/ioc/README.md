# Idea

Take service definitions, write a Express.js program in TypeScript which delegates calls to the service, compile that.

## Usage

1. Install TypeScript CLI

   `npm i -g typescript`

2. Compile the engine

   `tsc engine/engine.ts`

3. Generate the application

   `node engine/engine.js src/hello_service.ts`

4. Compile the application

   `tsc build/app.ts`

5. Run the application

   `node build/app.js`

6. Ping the server

   `curl localhost:3000/ping -H "Content-Type: application/json" -d '{"name": "Jim"}'`
