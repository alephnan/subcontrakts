export class HelloService {
  ping(request: any): any {
    console.log("Request: ", request);
    const name = (request && request.name) || " Unknown";
    return {
      message: "Hello " + name
    };
  }
}
