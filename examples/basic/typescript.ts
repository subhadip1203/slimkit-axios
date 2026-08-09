import axios, { type AxiosRequestConfig, type AxiosResponse } from '@slimkit/axios';

interface User {
  id: number;
  name: string;
  email: string;
}

interface CreateUser {
  name: string;
  email: string;
}

const config: AxiosRequestConfig = {
  baseURL: 'https://api.example.com',
  timeout: 5000
};

const api = axios.create(config);

export async function getUser(id: number): Promise<User> {
  const response: AxiosResponse<User> = await api.get<User>(`/users/${id}`);
  return response.data;
}

export async function createUser(input: CreateUser): Promise<User> {
  const { data } = await api.post<User, AxiosResponse<User, CreateUser>, CreateUser>('/users', input);
  return data;
}
