"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useApi, browserApi } from "./lib/api/default/index";

export function PetList() {
  // useApi gives you auto-magical React Query hooks for every API method
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

  const mutation = useMutation({
    mutationFn: (data: { name: string; tag?: string; age?: number }) =>
      browserApi.pets.createPet(data).then((result) => {
        if (!result.ok) throw result.error;
        return result.data;
      }),
    onSuccess: (data) => {
      alert("Created pet: " + data.name);
      setName("");
      setTag("");
      setAge(undefined);

      // Invalidate the pets list query to refetch
      useApi.pets.listPets.invalidate();
    },
    onError: (error) => {
      alert("Failed to create pet: " + error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({ name, tag: tag || undefined, age });
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Create Pet (useMutation)</h2>
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
      <button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Creating..." : "Create"}
      </button>
    </form>
  );
}

export function PlaceOrderForm() {
  const [petId, setPetId] = useState("");
  const [quantity, setQuantity] = useState(1);

  const mutation = useMutation({
    mutationFn: (data: { petId: string; quantity: number }) =>
      browserApi.store.placeOrder(data).then((result) => {
        if (!result.ok) throw result.error;
        return result.data;
      }),
    onSuccess: (data) => {
      alert(`Order placed! ID: ${data.id}, Status: ${data.status}`);
      setPetId("");
      setQuantity(1);

      // Invalidate store and order queries
      useApi.store.listStores.invalidate();
      useApi.store.getOrder.invalidate();
    },
    onError: (error) => {
      alert("Failed to place order: " + error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({ petId, quantity });
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Place Order (useMutation + invalidation)</h2>
      <input
        placeholder="Pet ID"
        value={petId}
        onChange={(e) => setPetId(e.target.value)}
        required
      />
      <input
        type="number"
        value={quantity}
        min={1}
        onChange={(e) => setQuantity(Number(e.target.value))}
      />
      <button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Placing..." : "Place Order"}
      </button>
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
  const mutation = useMutation({
    mutationFn: (credentials: { username: string; password: string }) =>
      browserApi.user.loginUser(credentials).then((result) => {
        if (!result.ok) throw result.error;
        return result.data;
      }),
    onSuccess: (data) => {
      alert("Logged in! Token: " + data.token.substring(0, 16) + "...");
    },
    onError: (error) => {
      alert("Login failed: " + error.message);
    },
  });

  return (
    <button
      onClick={() => mutation.mutate({ username: "demo", password: "demo123" })}
      disabled={mutation.isPending}
    >
      {mutation.isPending ? "Logging in..." : "Login as demo"}
    </button>
  );
}

export default function App() {
  return (
    <div>
      <h1>Petstore — React Query Example</h1>
      <PetList />
      <hr />
      <PetDetail petId="pet-1" />
      <hr />
      <StoreList />
      <hr />
      <CreatePetForm />
      <hr />
      <PlaceOrderForm />
      <hr />
      <UserProfile username="demo" />
      <hr />
      <LoginButton />
    </div>
  );
}
