import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool, settings } from '../config/database.js';
import { authenticateToken, requireLevel } from '../middleware/auth.js';
import { logAdminAction } from '../middleware/logger.js';
import { wowzaConfigService } from '../services/wowzaConfigService.js';
import { createFtpUser } from '../config/ftpService.js';

const router = express.Router();

// Listar revendas
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', status = '' } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (search) {
      whereClause += ' AND (nome LIKE ? OR email LIKE ? OR id LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (status) {
      whereClause += ' AND status_detalhado = ?';
      params.push(status);
    }

    // Contar total
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM revendas ${whereClause}`,
      params
    );

    // Buscar revendas
    const [revendas] = await pool.execute(
      `SELECT codigo, codigo_revenda, id, nome, email, telefone, streamings, espectadores, 
              bitrate, espaco, subrevendas, status, data_cadastro, dominio_padrao, 
              idioma_painel, tipo, ultimo_acesso_data, ultimo_acesso_ip, admin_criador,
              data_expiracao, status_detalhado, observacoes_admin, limite_uploads_diario,
              espectadores_ilimitado, bitrate_maximo, total_transmissoes, ultima_transmissao,
              espaco_usado_mb, data_ultima_atualizacao
       FROM revendas ${whereClause} 
       ORDER BY data_cadastro DESC 
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    res.json({
      revendas,
      total: countResult[0].total
    });

  } catch (error) {
    console.error('Erro ao buscar revendas:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Buscar revenda por ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const [revendas] = await pool.execute(
      'SELECT * FROM revendas WHERE codigo = ?',
      [req.params.id]
    );

    if (revendas.length === 0) {
      return res.status(404).json({ message: 'Revenda não encontrada' });
    }

    // Remover senha da resposta
    const { senha, ...revendaData } = revendas[0];
    res.json(revendaData);

  } catch (error) {
    console.error('Erro ao buscar revenda:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Criar revenda
router.post('/', authenticateToken, requireLevel(['super_admin', 'admin']), async (req, res) => {
  try {
    const {
      nome, email, telefone, senha, senha_stream, streamings, espectadores, bitrate, espaco,
      subrevendas, status_detalhado, data_expiracao, observacoes_admin,
      limite_uploads_diario, espectadores_ilimitado, bitrate_maximo,
      dominio_padrao, idioma_painel, url_suporte, plano_id, usuario, codigo_wowza_servidor
    } = req.body;

    // Validar campos obrigatórios
    if (!nome || !email || !senha || !usuario || !senha_stream) {
      return res.status(400).json({ message: 'Nome, email, usuário, senha e senha stream são obrigatórios' });
    }

    // Verificar se email já existe
    const [existingRevenda] = await pool.execute(
      'SELECT codigo FROM revendas WHERE email = ?',
      [email]
    );

    if (existingRevenda.length > 0) {
      return res.status(400).json({ message: 'Email já está em uso' });
    }

    // Verificar se usuário já existe
    const [existingUser] = await pool.execute(
      'SELECT codigo FROM revendas WHERE usuario = ?',
      [usuario]
    );

    if (existingUser.length > 0) {
      return res.status(400).json({ message: 'Usuário já está em uso' });
    }

    // Gerar ID único
    const generateId = () => Math.random().toString(36).substring(2, 8).toUpperCase();
    let id = generateId();

    // Verificar se ID já existe
    let [existingId] = await pool.execute('SELECT codigo FROM revendas WHERE id = ?', [id]);
    while (existingId.length > 0) {
      id = generateId();
      [existingId] = await pool.execute('SELECT codigo FROM revendas WHERE id = ?', [id]);
    }

    // Hash da senha
    const senhaHash = await bcrypt.hash(senha, 10);

    // Gerar chave API
    const chaveApi = jwt.sign({ id, email }, settings.JWT.SECRET);

    // Usar servidor fornecido ou obter servidor padrão das configurações
    let servidorSelecionado = codigo_wowza_servidor;

    if (!servidorSelecionado) {
      const [config] = await pool.execute(
        'SELECT codigo_wowza_servidor_atual FROM configuracoes WHERE codigo = 1'
      );
      servidorSelecionado = config[0]?.codigo_wowza_servidor_atual;
    }

    // Buscar dados do servidor para criar configuração Wowza
    const [serverData] = await pool.execute(
      'SELECT ip FROM wowza_servers WHERE codigo = ? AND status = "ativo"',
      [servidorSelecionado]
    );

    const [result] = await pool.execute(
      `INSERT INTO revendas (
    codigo_revenda, id, usuario, nome, email, telefone, senha, senha_stream,
    streamings, espectadores, bitrate, espaco, subrevendas, chave_api, status,
    data_cadastro, dominio_padrao, idioma_painel, tipo, ultimo_acesso_data,
    ultimo_acesso_ip, admin_criador, data_expiracao, status_detalhado,
    observacoes_admin, limite_uploads_diario, espectadores_ilimitado,
    bitrate_maximo, url_suporte, codigo_wowza_servidor, plano_id
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?, NOW(),
    ?, ?, ?, NOW(),
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  )`,
      [
        0, id, usuario, nome, email, telefone,
        senhaHash, senha_stream,
        streamings, espectadores, bitrate, espaco, subrevendas,
        chaveApi, 1, dominio_padrao, idioma_painel, 1,
        '0.0.0.0', req.admin.codigo,
        data_expiracao || null, status_detalhado, observacoes_admin,
        limite_uploads_diario, espectadores_ilimitado ? 1 : 0,
        bitrate_maximo, url_suporte, servidorSelecionado, plano_id || null
      ]
    );


    // Criar configuração Wowza no servidor
    if (serverData[0]) {
      try {
        const wowzaResult = await wowzaConfigService.createWowzaConfig({
          nome: usuario, // Usar o usuário da revenda como nome da aplicação
          serverIp: serverData[0].ip,
          bitrate: bitrate_maximo || bitrate,
          espectadores: espectadores_ilimitado ? 999999 : espectadores,
          senha: senha
        });

        console.log(`✅ Configuração Wowza criada para revenda ${usuario}`);
      } catch (wowzaError) {
        console.error('Erro ao criar configuração Wowza:', wowzaError);
        // Não falhar a criação da revenda se houver erro no Wowza
        // mas registrar no log
        await logAdminAction(req.admin.codigo, 'wowza_config_error', 'revendas', result.insertId, null, { error: wowzaError.message }, req);
      }
    }
    // Log da ação
    await logAdminAction(req.admin.codigo, 'create', 'revendas', result.insertId, null, req.body, req);

    // Criar usuário de streaming automaticamente com os mesmos dados da revenda
    try {
      const senhaHashStreaming = await bcrypt.hash(senha, 10);
      const senhaTransmissaoHashStreaming = await bcrypt.hash(senha_stream, 10);
      const ftpDirStreaming = `/home/streaming/${usuario}`;

      const [streamingResult] = await pool.execute(
        `INSERT INTO streamings (
          codigo_cliente, plano_id, codigo_servidor, usuario, senha, senha_transmissao,
          identificacao, email, espectadores, bitrate, espaco, espaco_usado,
          ftp_dir, aplicacao, idioma_painel, descricao, data_cadastro,
          player_titulo, player_descricao, app_nome, app_email
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?)`,
        [
          result.insertId, plano_id || null, servidorSelecionado, usuario, senhaHashStreaming, senhaTransmissaoHashStreaming,
          nome, email, espectadores, bitrate, espaco, 0,
          ftpDirStreaming, 'live', idioma_painel || 'pt-br', '',
          nome, '', nome, email
        ]
      );

      // Criar configuração Wowza para o streaming
      if (serverData[0]) {
        try {
          const wowzaStreamingResult = await wowzaConfigService.createWowzaConfig({
            nome: usuario,
            serverIp: serverData[0].ip,
            bitrate: bitrate,
            espectadores: espectadores,
            senha: senha
          });

          console.log(`✅ Configuração Wowza criada para streaming ${usuario} (revenda ${usuario})`);
        } catch (wowzaStreamingError) {
          console.error('Erro ao criar configuração Wowza para streaming:', wowzaStreamingError);
          await logAdminAction(req.admin.codigo, 'wowza_config_error', 'streamings', streamingResult.insertId, null, { error: wowzaStreamingError.message }, req);
        }
      }

      await logAdminAction(req.admin.codigo, 'create', 'streamings', streamingResult.insertId, null, {
        codigo_cliente: result.insertId,
        usuario,
        email,
        identificacao: nome
      }, req);

      console.log(`✅ Streaming ${usuario} criada automaticamente para revenda ${usuario}`);

      await createFtpUser({
        serverId: servidorSelecionado,
        username: usuario,
        password: senha
      });

      console.log(`📁 FTP criado no servidor Wowza para ${usuario}`);
    } catch (streamingError) {
      console.error('Erro ao criar streaming automaticamente:', streamingError);
      // Log do erro mas não falha a criação da revenda
      await logAdminAction(req.admin.codigo, 'streaming_auto_create_error', 'revendas', result.insertId, null, { error: streamingError.message }, req);
    }

    res.status(201).json({ message: 'Revenda criada com sucesso', codigo: result.insertId });

  } catch (error) {
    console.error('Erro ao criar revenda:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Atualizar revenda
router.put('/:id', authenticateToken, requireLevel(['super_admin', 'admin']), async (req, res) => {
  try {
    const revendaId = req.params.id;

    // Buscar dados anteriores
    const [revendaAnterior] = await pool.execute(
      'SELECT * FROM revendas WHERE codigo = ?',
      [revendaId]
    );

    if (revendaAnterior.length === 0) {
      return res.status(404).json({ message: 'Revenda não encontrada' });
    }

    const {
      nome, email, telefone, senha, senha_stream, streamings, espectadores, bitrate, espaco,
      subrevendas, status_detalhado, data_expiracao, observacoes_admin,
      limite_uploads_diario, espectadores_ilimitado, bitrate_maximo,
      dominio_padrao, idioma_painel, url_suporte, plano_id, usuario, codigo_wowza_servidor
    } = req.body;

    let updateQuery = `
      UPDATE revendas SET
        usuario = ?, nome = ?, email = ?, telefone = ?, streamings = ?, espectadores = ?,
        bitrate = ?, espaco = ?, subrevendas = ?, status_detalhado = ?,
        data_expiracao = ?, observacoes_admin = ?, limite_uploads_diario = ?,
        espectadores_ilimitado = ?, bitrate_maximo = ?, dominio_padrao = ?,
        idioma_painel = ?, url_suporte = ?, plano_id = ?, data_ultima_atualizacao = NOW()
    `;

    let params = [
      usuario, nome, email, telefone, streamings, espectadores, bitrate, espaco,
      subrevendas, status_detalhado, data_expiracao || null, observacoes_admin,
      limite_uploads_diario, espectadores_ilimitado ? 1 : 0, bitrate_maximo,
      dominio_padrao, idioma_painel, url_suporte, plano_id || null
    ];

    // Adicionar servidor se fornecido
    if (codigo_wowza_servidor) {
      updateQuery += ', codigo_wowza_servidor = ?';
      params.push(codigo_wowza_servidor);
    }

    // Se senha foi fornecida, incluir na atualização
    if (senha && senha.trim() !== '') {
      const senhaHash = await bcrypt.hash(senha, 10);
      updateQuery += ', senha = ?';
      params.push(senhaHash);
    }

    // Se senha_stream foi fornecida, incluir na atualização
    if (senha_stream && senha_stream.trim() !== '') {
      updateQuery += ', senha_stream = ?';
      params.push(senha_stream);
    }


    updateQuery += ' WHERE codigo = ?';
    params.push(revendaId);

    await pool.execute(updateQuery, params);

    // Atualizar configuração Wowza se necessário
    try {
      const [serverData] = await pool.execute(
        'SELECT ws.ip FROM wowza_servers ws JOIN revendas r ON r.codigo_wowza_servidor = ws.codigo WHERE r.codigo = ?',
        [revendaId]
      );

      if (serverData[0]) {
        const wowzaResult = await wowzaConfigService.updateWowzaConfig(
          revendaAnterior[0].usuario, // Usuário da revenda
          serverData[0].ip,
          {
            bitrate: bitrate_maximo || bitrate,
            espectadores: espectadores_ilimitado ? 999999 : espectadores
          }
        );
      }
    } catch (wowzaError) {
      console.error('Erro ao atualizar configuração Wowza:', wowzaError);
      // Registrar erro mas não falhar a atualização
      await logAdminAction(req.admin.codigo, 'wowza_update_error', 'revendas', revendaId, null, { error: wowzaError.message }, req);
    }
    // Log da ação
    await logAdminAction(req.admin.codigo, 'update', 'revendas', revendaId, revendaAnterior[0], req.body, req);

    res.json({ message: 'Revenda atualizada com sucesso' });

  } catch (error) {
    console.error('Erro ao atualizar revenda:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Suspender revenda
router.post('/:id/suspend', authenticateToken, requireLevel(['super_admin', 'admin']), async (req, res) => {
  try {
    const revendaId = req.params.id;

    await pool.execute(
      'UPDATE revendas SET status_detalhado = ?, data_ultima_atualizacao = NOW() WHERE codigo = ?',
      ['suspenso', revendaId]
    );

    // Log da ação
    await logAdminAction(req.admin.codigo, 'suspend', 'revendas', revendaId, null, { status_detalhado: 'suspenso' }, req);

    res.json({ message: 'Revenda suspensa com sucesso' });

  } catch (error) {
    console.error('Erro ao suspender revenda:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Ativar revenda
router.post('/:id/activate', authenticateToken, requireLevel(['super_admin', 'admin']), async (req, res) => {
  try {
    const revendaId = req.params.id;

    await pool.execute(
      'UPDATE revendas SET status_detalhado = ?, data_ultima_atualizacao = NOW() WHERE codigo = ?',
      ['ativo', revendaId]
    );

    // Log da ação
    await logAdminAction(req.admin.codigo, 'activate', 'revendas', revendaId, null, { status_detalhado: 'ativo' }, req);

    res.json({ message: 'Revenda ativada com sucesso' });

  } catch (error) {
    console.error('Erro ao ativar revenda:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Excluir revenda
router.delete('/:id', authenticateToken, requireLevel(['super_admin', 'admin']), async (req, res) => {
  try {
    const revendaId = req.params.id;

    // Buscar dados antes de excluir
    const [revenda] = await pool.execute(
      'SELECT * FROM revendas WHERE codigo = ?',
      [revendaId]
    );

    if (revenda.length === 0) {
      return res.status(404).json({ message: 'Revenda não encontrada' });
    }

    // Remover configuração Wowza
    try {
      const [serverData] = await pool.execute(
        'SELECT ws.ip FROM wowza_servers ws JOIN revendas r ON r.codigo_wowza_servidor = ws.codigo WHERE r.codigo = ?',
        [revendaId]
      );

      if (serverData[0]) {
        await wowzaConfigService.removeWowzaConfig(revenda[0].usuario, serverData[0].ip);
      }
    } catch (wowzaError) {
      console.error('Erro ao remover configuração Wowza:', wowzaError);
      // Continuar com a exclusão mesmo se houver erro no Wowza
    }
    await pool.execute('DELETE FROM revendas WHERE codigo = ?', [revendaId]);

    // Log da ação
    await logAdminAction(req.admin.codigo, 'delete', 'revendas', revendaId, revenda[0], null, req);

    res.json({ message: 'Revenda excluída com sucesso' });

  } catch (error) {
    console.error('Erro ao excluir revenda:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Sincronizar configuração Wowza da revenda
router.post('/:id/sync-wowza', authenticateToken, requireLevel(['super_admin', 'admin']), async (req, res) => {
  try {
    const revendaId = req.params.id;

    // Buscar dados da revenda
    const [revenda] = await pool.execute(
      'SELECT * FROM revendas WHERE codigo = ?',
      [revendaId]
    );

    if (revenda.length === 0) {
      return res.status(404).json({ message: 'Revenda não encontrada' });
    }

    const revendaData = revenda[0];

    if (!revendaData.usuario) {
      return res.status(400).json({ message: 'Revenda não possui usuário definido' });
    }

    // Buscar dados do servidor
    const [serverData] = await pool.execute(
      'SELECT ws.ip FROM wowza_servers ws JOIN revendas r ON r.codigo_wowza_servidor = ws.codigo WHERE r.codigo = ?',
      [revendaId]
    );

    if (!serverData[0]) {
      return res.status(400).json({ message: 'Servidor não encontrado para esta revenda' });
    }

    // Sincronizar configuração Wowza
    const wowzaResult = await wowzaConfigService.syncWowzaConfig({
      nome: revendaData.usuario,
      serverIp: serverData[0].ip,
      bitrate: revendaData.bitrate_maximo || revendaData.bitrate,
      espectadores: revendaData.espectadores_ilimitado ? 999999 : revendaData.espectadores,
      senha: revendaData.senha_stream
    });

    // Log da ação
    await logAdminAction(req.admin.codigo, 'sync_wowza', 'revendas', revendaId, null, {
      action: wowzaResult.action,
      message: wowzaResult.message
    }, req);

    res.json({
      message: wowzaResult.message,
      action: wowzaResult.action,
      success: true
    });

  } catch (error) {
    console.error('Erro ao sincronizar configuração Wowza:', error);
    res.status(500).json({
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
});

export default router;