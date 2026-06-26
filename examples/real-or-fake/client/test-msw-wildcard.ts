import { http, type PathParams } from "msw";

export const handler = http.get<PathParams<"*/memes">>(
  "*/memes",
  async ({ params }) => {
    return new Response();
  },
);
