import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListPromptsRequestSchema, GetPromptRequestSchema } from "@modelcontextprotocol/sdk/types.js";

export function setupPrompts(server: Server) {
    server.setRequestHandler(ListPromptsRequestSchema, async () => {
        return {
            prompts: [
                {
                    name: "cocos-api-24x",
                    description: "Useful API snippets and boundaries for Cocos Creator 2.4.x modifications.",
                }
            ]
        };
    });

    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
        if (request.params.name === "cocos-api-24x") {
            return {
                description: "Cocos 2.4.x API boundaries",
                messages: [
                    {
                        role: "user",
                        content: {
                            type: "text",
                            text: "Important CC 2.4 limits: 1. Hide node: `node.active = false` (No .visible!). 2. Access components: `node.getComponent(cc.Label)`. 3. Opacity: `node.opacity = 255`."
                        }
                    }
                ]
            };
        }
        throw new Error("Prompt not found");
    });
}
