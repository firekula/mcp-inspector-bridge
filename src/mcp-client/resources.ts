import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListResourcesRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";

export function setupResources(server: Server, sendRpcToCocos: (method: string, args?: any) => Promise<any>) {
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
        return {
            resources: [
                {
                    uri: "scene://hierarchy",
                    name: "Scene Hierarchy Tree",
                    description: "A JSON representation of the entire node tree in the current scene.",
                    mimeType: "application/json"
                }
            ]
        };
    });

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        if (request.params.uri === "scene://hierarchy") {
            const res = await sendRpcToCocos('get_node_tree', { depth: 10 });
            return {
                contents: [
                    { uri: "scene://hierarchy", mimeType: "application/json", text: JSON.stringify(res.content || res, null, 2) }
                ]
            };
        }
        throw new Error("Resource not found");
    });
}
