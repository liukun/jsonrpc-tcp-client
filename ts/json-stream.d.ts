declare module "json-stream" {
  import * as stream from "stream"
  export class JSONStream extends stream.Transform {
  }
}
