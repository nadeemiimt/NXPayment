/** Minimal OpenAPI 3 document for agent shopping — machine-readable, no browser needed. */
export function agentOpenApiDocument() {
  return {
    openapi: "3.0.3",
    info: {
      title: "NXPayment Agent Commerce API",
      version: "1.0.0",
      description:
        "Agent-friendly catalog, quote, and UPI payment APIs. Funds settle direct to the merchant VPA. Auth: Bearer agent API key.",
    },
    servers: [{ url: "/" }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "Agent API key from merchant Setup (copy once).",
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      "/api/agent/v1/catalog": {
        get: {
          operationId: "list_catalog",
          summary: "List inventory catalog",
          parameters: [
            { name: "shopId", in: "query", schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer" } },
            { name: "pageSize", in: "query", schema: { type: "integer" } },
            { name: "q", in: "query", schema: { type: "string" } },
          ],
          responses: { "200": { description: "Catalog page" } },
        },
      },
      "/api/agent/v1/quote": {
        post: {
          operationId: "quote_cart",
          summary: "Quote a cart of inventory lines",
          responses: { "200": { description: "Quote with totalPaise" } },
        },
      },
      "/api/agent/v1/payments": {
        post: {
          operationId: "create_payment",
          summary: "Create payment (amountPaise or lines)",
          description:
            "Returns amountPaise, upiUri, qrPayload, deepLinks, provider. Default provider is upi_direct.",
          responses: { "201": { description: "Payment created" } },
        },
      },
      "/api/agent/v1/payments/{id}": {
        get: {
          operationId: "get_payment",
          summary: "Get payment status",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { "200": { description: "Payment status" } },
        },
      },
      "/api/agent/v1/payments/{id}/confirm": {
        post: {
          operationId: "confirm_credit",
          summary: "Optional merchant-style confirm (agent-triggered)",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { "200": { description: "Confirmed payment" } },
        },
      },
    },
  };
}
