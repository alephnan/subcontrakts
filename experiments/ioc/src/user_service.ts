export class UserService {
  constructor() {}

  lookup(request: any): any {
    if (request.user_id == 1) {
      return {
        name: "Bob"
      };
    } else {
      return {
        name: "Jim"
      };
    }
  }
}
