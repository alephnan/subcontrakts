class HelloService {
  ping(request: any): any {
    if (1 == 1) {
      return {
        message: "Hi"
      };
    }

    return {
      message: "Yo"
    };
  }
}
