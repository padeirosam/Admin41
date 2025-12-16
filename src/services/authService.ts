import { Admin } from '../types/admin';
import { AccessProfile } from '../types/profile';

interface LoginResponse {
  admin: Admin;
  token: string;
}

interface ApiError {
  message: string;
  status?: number;
}

class AuthService {
  private baseURL = import.meta.env.VITE_API_URL || '/api';

  private async handleApiResponse(response: Response) {
    if (!response.ok) {
      let error: ApiError;
      try {
        error = await response.json();
      } catch (e) {
        // Se não conseguir fazer parse do JSON, criar erro genérico
        error = { 
          message: this.getErrorMessageByStatus(response.status),
          status: response.status 
        };
      }
      
      // Se for erro 401 ou 403, limpar token e redirecionar
      if (response.status === 401 || response.status === 403) {
        this.clearAuthData();
        window.location.href = '/login';
      }
      
      throw new Error(error.message || 'Erro de comunicação com o servidor');
    }
    return response;
  }

  private getErrorMessageByStatus(status: number): string {
    switch (status) {
      case 400:
        return 'Dados inválidos enviados para o servidor';
      case 401:
        return 'Credenciais inválidas ou sessão expirada';
      case 403:
        return 'Acesso negado';
      case 404:
        return 'Serviço não encontrado. Verifique se o servidor está rodando';
      case 500:
        return 'Erro interno do servidor';
      case 502:
        return 'Servidor indisponível';
      case 503:
        return 'Serviço temporariamente indisponível';
      default:
        return 'Erro de comunicação com o servidor';
    }
  }

  private clearAuthData() {
    localStorage.removeItem('admin_token');
  }

  async login(email: string, senha: string): Promise<LoginResponse> {
    try {
      console.log('Tentando fazer login para:', email);
      console.log('URL da API:', `${this.baseURL}/auth/login`);
      
      const response = await fetch(`${this.baseURL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, senha }),
      });

      console.log('Status da resposta:', response.status);
      
      await this.handleApiResponse(response);

      return await response.json();
    } catch (error) {
      console.error('Erro no authService.login:', error);
      
      // Se for erro de rede, mostrar mensagem específica
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Não foi possível conectar ao servidor. Verifique sua conexão e se o servidor está rodando.');
      }
      
      throw error;
    }
  }

  async validateToken(token: string): Promise<Admin> {
    try {
      const response = await fetch(`${this.baseURL}/auth/validate`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      await this.handleApiResponse(response);

      return await response.json();
    } catch (error) {
      // Se token for inválido, limpar dados de auth
      this.clearAuthData();
      throw error;
    }
  }

  async logout(): Promise<void> {
    const token = localStorage.getItem('admin_token');
    if (token) {
      try {
        await fetch(`${this.baseURL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
      } catch (error) {
        console.error('Erro ao fazer logout:', error);
      }
    }
    this.clearAuthData();
  }

  async getProfile(profileId: number): Promise<AccessProfile> {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`${this.baseURL}/profiles/${profileId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      await this.handleApiResponse(response);

      return await response.json();
    } catch (error) {
      throw error;
    }
  }

  // Método para verificar se o servidor está disponível
  async checkServerHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseURL}/health`, {
        method: 'GET',
        timeout: 5000
      } as any);
      
      return response.ok;
    } catch (error) {
      console.error('Servidor não está respondendo:', error);
      return false;
    }
  }
}

export const authService = new AuthService();