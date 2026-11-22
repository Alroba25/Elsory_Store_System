export type AuthMode = "login" | "register";

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginFormValues extends LoginCredentials {
  rememberMe: boolean;
}

export interface LoginFormErrors {
  email?: string;
  password?: string;
  form?: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
}

export interface RegisterFormValues extends RegisterPayload {
  confirmPassword: string;
}

export interface RegisterFormErrors {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  form?: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role:
    | "owner"
    | "cashier"
    | "accessories_seller"
    | "phone_seller"
    | "maintenance_seller"
    | "general";
}

export interface AuthResult {
  ok: boolean;
  status: number;
  message: string;
  user: AuthUser;
}

export interface RegisterResult {
  ok: boolean;
  status: number;
  message: string;
  user: AuthUser;
}
