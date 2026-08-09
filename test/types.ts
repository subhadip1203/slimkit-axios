import axios, {
  Axios,
  AxiosError,
  AxiosHeaders,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig
} from '@slimkit/axios';

interface User { id: number; name: string }
interface CreateUser { name: string }

const config: AxiosRequestConfig<CreateUser> = {
  baseURL: 'https://example.test',
  data: { name: 'Ada' },
  paramsSerializer: { indexes: false },
  signal: new AbortController().signal
};

const client = axios.create(config);
const responsePromise: Promise<AxiosResponse<User>> = client.get<User>('/users/1');
const createdPromise: Promise<AxiosResponse<User, CreateUser>> = client.post<User, AxiosResponse<User, CreateUser>, CreateUser>('/users', { name: 'Ada' });
const directPromise: Promise<AxiosResponse<User>> = axios<User>('/users/1');
const classPromise: Promise<AxiosResponse<User>> = new Axios().get<User>('/users/1');

client.interceptors.request.use((request: InternalAxiosRequestConfig) => {
  request.headers.set('X-Test', 'yes');
  return request;
}, undefined, { synchronous: true, runWhen: request => request.method === 'get' });

const headers = new AxiosHeaders({ Accept: 'application/json' });
const error: AxiosError<User> = new axios.AxiosError('failed');
const status: number = axios.HttpStatusCode.Ok;
void [responsePromise, createdPromise, directPromise, classPromise, headers, error, status];

// @ts-expect-error - a typo'd option must be rejected now that AxiosRequestConfig is a closed type
const typoCheck: AxiosRequestConfig = { timeuot: 5000 };
void typoCheck;
