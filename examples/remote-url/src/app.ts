import { createApiClient } from "./lib/api/default/client";
import { createApi } from "./lib/api/default/index";

async function main() {
  const client = createApiClient();
  const api = createApi(client);

  console.log("Fetching pets from remote API...");
  const { data, error, ok } = await api.pets.listPets();

  if (!ok || !data) {
    console.error("Failed:", error?.message);
    return;
  }

  console.log("Pets:", data);
}

main();
