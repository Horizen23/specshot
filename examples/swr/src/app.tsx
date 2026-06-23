"use client";

import { useState } from "react";
import { useApi, browserApi } from "./lib/api/petstore/index";

export function PetList() {
  // useApi gives you auto-magical SWR hooks for every API method
  const { data: pets, error, isLoading } = useApi.pets.listPets();

  if (isLoading) return <div>Loading pets...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h2>Pets ({pets?.length ?? 0})</h2>
      <ul>
        {pets?.map((pet) => (
          <li key={pet.id}>
            {pet.name} — {pet.tag ?? "no tag"} (age {pet.age ?? "?"})
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PetDetail({ petId }: { petId: string }) {
  const { data: pet, error, isLoading } = useApi.pets.getPet(petId);

  if (isLoading) return <div>Loading pet {petId}...</div>;
  if (error) return <div>Error loading pet: {error.message}</div>;
  if (!pet) return <div>Pet not found</div>;

  return (
    <div>
      <h2>{pet.name}</h2>
      <p>ID: {pet.id}</p>
      <p>Age: {pet.age ?? "unknown"}</p>
      <p>Tag: {pet.tag ?? "none"}</p>
    </div>
  );
}

export function StoreList() {
  const { data: stores, error, isLoading } = useApi.store.listStores();

  if (isLoading) return <div>Loading stores...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h2>Stores ({stores?.length ?? 0})</h2>
      <ul>
        {stores?.map((store) => (
          <li key={store.id}>
            {store.address}
            {store.pet && ` — has pet: ${store.pet.name}`}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CreatePetForm() {
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [age, setAge] = useState<number | undefined>();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await browserApi.pets.createPet({
      name,
      tag: tag || undefined,
      age,
    });

    if (!result.ok) {
      alert("Failed to create pet: " + result.error.message);
      return;
    }

    alert("Created pet: " + result.data.name);
    setName("");
    setTag("");
    setAge(undefined);

    // Optimistically update the SWR cache for the pets list
    useApi.pets.listPets.mutate();
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Create Pet</h2>
      <input
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        placeholder="Tag"
        value={tag}
        onChange={(e) => setTag(e.target.value)}
      />
      <input
        type="number"
        placeholder="Age"
        value={age ?? ""}
        onChange={(e) =>
          setAge(e.target.value ? Number(e.target.value) : undefined)
        }
      />
      <button type="submit">Create</button>
    </form>
  );
}

export function UserProfile({ username }: { username: string }) {
  const { data: user, error, isLoading } = useApi.user.getUser(username);

  if (isLoading) return <div>Loading user {username}...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!user) return <div>User not found</div>;

  return (
    <div>
      <h2>{user.username}</h2>
      <p>
        {user.firstName} {user.lastName}
      </p>
      <p>Email: {user.email ?? "none"}</p>
    </div>
  );
}

export function LoginButton() {
  const handleLogin = async () => {
    const result = await browserApi.user.loginUser({
      params: {
        username: "demo",
        password: "demo123",
      },
    });

    if (!result.ok) {
      alert("Login failed: " + result.error.message);
      return;
    }

    alert("Logged in! Token: " + result.data.token.substring(0, 16) + "...");
  };

  return <button onClick={handleLogin}>Login as demo</button>;
}

export default function App() {
  return (
    <div>
      <h1>Petstore — SWR Example</h1>
      <PetList />
      <hr />
      <PetDetail petId="pet-1" />
      <hr />
      <StoreList />
      <hr />
      <CreatePetForm />
      <hr />
      <UserProfile username="demo" />
      <hr />
      <LoginButton />
    </div>
  );
}
