import { OpenAPIToolset as BaseOpenAPIToolset } from './openapi-toolset';

export abstract class OpenAPIToolset extends BaseOpenAPIToolset {
  constructor() {
    super();

    console.warn('Please import "OpenAPIToolset" from "@bactor/agent/integration" instead of "@bactor/agent"');
  }
}
