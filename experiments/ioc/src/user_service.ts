interface Foo {}

interface Bar {}

export class UserService {
  constructor() {}

  lookup(request: Foo): Bar {
    if ((request as any).user_id == 1) {
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
