'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

export interface AuthUser {
  id: number;
  nome: string;
  name?: string;
  email: string;
  tipo: 'cliente' | 'profissional' | 'admin' | string;
  role?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (usuario: AuthUser, token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * NOTA DE ARQUITETURA E SEGURANÇA:
 * O armazenamento de tokens de acesso JWT e dados de usuário no localStorage é utilizado
 * nesta fase para permitir autenticação cliente via cabeçalhos Authorization: Bearer
 * entre origens desacopladas (Next.js em localhost:3000 e FastAPI em localhost:8000).
 *
 * Limitação conhecida: o localStorage é acessível por scripts client-side, sendo suscetível
 * a riscos de XSS. Em evolução futura para produção, recomenda-se a transição para cookies
 * com atributo httpOnly, flags Secure/SameSite e proteção CSRF integrada.
 */
const USER_STORAGE_KEY = 'rentalspouse_user';
const TOKEN_STORAGE_KEY = 'rentalspouse_token';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        if (typeof window !== 'undefined') {
          const storedUser = localStorage.getItem(USER_STORAGE_KEY);
          const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);

          if (storedUser && storedToken) {
            const parsedUser: AuthUser = JSON.parse(storedUser);
            setUser(parsedUser);
            setToken(storedToken);

            // Validação e sincronização com o servidor via GET /api/auth/me
            const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
            try {
              const res = await fetch(`${apiUrl}/api/auth/me`, {
                headers: {
                  Authorization: `Bearer ${storedToken}`,
                  Accept: 'application/json',
                },
              });

              if (res.ok) {
                const me = await res.json();
                const refreshedUser: AuthUser = {
                  id: me.id,
                  nome: me.name || me.nome || parsedUser.nome,
                  name: me.name,
                  email: me.email,
                  tipo: me.role === 'admin' ? 'admin' : me.role === 'professional' ? 'profissional' : 'cliente',
                  role: me.role,
                };
                setUser(refreshedUser);
                localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(refreshedUser));
              } else if (res.status === 401 || res.status === 403) {
                // Token expirado ou revogado no servidor: limpa sessão client-side
                setUser(null);
                setToken(null);
                localStorage.removeItem(USER_STORAGE_KEY);
                localStorage.removeItem(TOKEN_STORAGE_KEY);
              }
            } catch (networkError) {
              // Se o servidor backend estiver indisponível no momento, preserva estado local em cache
              console.warn('Não foi possível validar o token junto ao servidor:', networkError);
            }
          }
        }
      } catch (error) {
        console.error('Falha ao restaurar sessão de autenticação:', error);
      } finally {
        setIsLoading(false);
      }
    };

    restoreSession();
  }, []);

  const login = (usuario: AuthUser, novoToken: string) => {
    const formattedUser: AuthUser = {
      ...usuario,
      nome: usuario.nome || usuario.name || '',
      tipo:
        usuario.tipo ||
        (usuario.role === 'admin'
          ? 'admin'
          : usuario.role === 'professional'
          ? 'profissional'
          : 'cliente'),
    };
    setUser(formattedUser);
    setToken(novoToken);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(formattedUser));
        localStorage.setItem(TOKEN_STORAGE_KEY, novoToken);
      }
    } catch (error) {
      console.error('Erro ao persistir sessão:', error);
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(USER_STORAGE_KEY);
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    } catch (error) {
      console.error('Erro ao remover sessão:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um <AuthProvider>');
  }
  return context;
};
