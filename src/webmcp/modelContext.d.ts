/**
 * The WebMCP surface this app uses, typed after the spec's IDL
 * (https://webmachinelearning.github.io/webmcp/). Chrome ships it behind
 * chrome://flags/#enable-webmcp-testing; the ChatGPT desktop browser ships it
 * by default. Everything is optional at the type level because the app must
 * keep working where it is absent.
 */
interface ToolAnnotations { readOnlyHint?: boolean; untrustedContentHint?: boolean }

interface ModelContextTool {
  name: string;
  title?: string;
  description: string;
  inputSchema?: object;
  annotations?: ToolAnnotations;
  execute: (input: any, options: { signal: AbortSignal }) => Promise<any>;
}

interface RegisteredTool {
  name: string; title?: string; description: string; inputSchema?: object;
  window: Window; origin: string; annotations?: ToolAnnotations;
}

interface ModelContext extends EventTarget {
  registerTool(tool: ModelContextTool, options?: { exposedTo?: string[]; signal?: AbortSignal }): Promise<void>;
  getTools(options?: { fromOrigins?: string[] }): Promise<RegisteredTool[]>;
  executeTool(tool: RegisteredTool, input?: object | string, options?: { signal?: AbortSignal }): Promise<string>;
  ontoolchange: ((ev: Event) => void) | null;
}

interface Document {
  readonly modelContext?: ModelContext;
}
