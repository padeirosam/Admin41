// Serviço base para todas as chamadas de API com tratamento de erros centralizado
class ApiService {
  private baseURL = import.meta.env.VITE_API_URL || '/api';

  private getAuthHeaders() {
    const token = localStorage.getItem('admin_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };
  }

  private async handleResponse(response: Response) {
    if (!response.ok) {
      let error;
      try {
        error = await response.json();
      } catch (e) {
        error = { message: this.getErrorMessageByStatus(response.status) };
      }

      // Se for erro 401 ou 403, limpar token e redirecionar
      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('admin_token');
        
        // Só redirecionar se não estivermos já na página de login
        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
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
        return 'Recurso não encontrado';
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

  async get(endpoint: string, params?: Record<string, string>): Promise<any> {
    try {
      const url = new URL(`${this.baseURL}${endpoint}`);
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          url.searchParams.append(key, value);
        });
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      await this.handleResponse(response);
      return await response.json();
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Não foi possível conectar ao servidor. Verifique sua conexão.');
      }
      throw error;
    }
  }

  async post(endpoint: string, data?: any): Promise<any> {
    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: data ? JSON.stringify(data) : undefined,
      });

      await this.handleResponse(response);
      return await response.json();
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Não foi possível conectar ao servidor. Verifique sua conexão.');
      }
      throw error;
    }
  }

  async put(endpoint: string, data?: any): Promise<any> {
    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: data ? JSON.stringify(data) : undefined,
      });

      await this.handleResponse(response);
      return await response.json();
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Não foi possível conectar ao servidor. Verifique sua conexão.');
      }
      throw error;
    }
  }

  async delete(endpoint: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders(),
      });

      await this.handleResponse(response);
      
      // DELETE pode retornar 204 No Content
      if (response.status === 204) {
        return {};
      }
      
      return await response.json();
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Não foi possível conectar ao servidor. Verifique sua conexão.');
      }
      throw error;
    }
  }
}

export const apiService = new ApiService();