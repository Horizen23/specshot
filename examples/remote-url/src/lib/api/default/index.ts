import { ApiClient } from "../core/api-client";
export * from "./types";
export * from "./client";

export * from "./services/pets.service";
import { petsService } from "./services/pets.service";

export function createApi(client: ApiClient) {
  return {
    client,
    pets: new petsService(client),
  } as const;
}
