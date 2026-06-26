import { useMemo } from 'react';

export function useAuth() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  
  const user = useMemo(() => {
    return token ? { token } : null;
  }, [token]);

  return { user };
}
