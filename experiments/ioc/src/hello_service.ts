import { UserService } from "./user_service";

export class HelloService {
  private userService: UserService;

  constructor(userService: UserService) {
    this.userService = userService;
  }

  ping(request: any): any {
    console.log("Request: ", request);
    const resp = this.userService.lookup(request);
    const name = resp.name || " Unknown";
    return {
      message: "Hello " + name
    };
  }
}
