import { createApiClient } from "./lib/api/default/client";
import { createApi } from "./lib/api/default/index";

async function main() {
  // Create API client (in real app, point to your backend)
  const client = createApiClient();
  const api = createApi(client);

  // List pets - fully typed!
  const { data, error, ok } = await api.pets.listPets();

  if (!ok) {
    console.error("Failed to fetch pets:", error.message);
    return;
  }

  console.log("Pets:", data);

  // Create a pet
  const result = await api.pets.createPet({ name: "Buddy", species: "dog" });
  if (result.ok) {
    console.log("Created pet:", result.data);
  }
}

main();
