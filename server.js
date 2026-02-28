const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'flowtask_super_secret_key'; // Em produção, usar variável de ambiente

// Middlewares
app.use(cors());
app.use(express.json());

// Serve os ficheiros estáticos da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Middleware de Proteção de Rotas
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Token não fornecido' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token inválido ou expirado' });
        req.user = user;
        next();
    });
};

// --- ROTAS DE AUTENTICAÇÃO ---

app.post('/api/auth/signup', (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Preencha todos os campos obrigatórios' });
    }

    try {
        const hashedPassword = bcrypt.hashSync(password, 10);
        const stmt = db.prepare('INSERT INTO users (name, email, password) VALUES (?, ?, ?)');
        const info = stmt.run(name, email, hashedPassword);
        res.status(201).json({ id: info.lastInsertRowid, message: 'Usuário criado com sucesso' });
    } catch (error) {
        if (error.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Este e-mail já está em uso' });
        }
        res.status(500).json({ error: 'Erro interno ao criar conta' });
    }
});

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    try {
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        if (!user || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ error: 'E-mail ou senha incorretos' });
        }

        const token = jwt.sign({ id: user.id, name: user.name }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ 
            token, 
            user: { name: user.name, email: user.email, level: user.level } 
        });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao processar login' });
    }
});

// --- ROTAS DE TAREFAS (CRUD) ---

app.get('/api/tasks', authenticateToken, (req, res) => {
    const tasks = db.prepare('SELECT * FROM tasks WHERE user_id = ?').all(req.user.id);
    // Converte 0/1 do SQLite para boolean para o front-end
    const formattedTasks = tasks.map(t => ({ ...t, completed: !!t.completed }));
    res.json(formattedTasks);
});

app.post('/api/tasks', authenticateToken, (req, res) => {
    const { title, project, priority, complexity, color } = req.body;
    try {
        const stmt = db.prepare(`
            INSERT INTO tasks (user_id, title, project, priority, complexity, color, completed) 
            VALUES (?, ?, ?, ?, ?, ?, 0)
        `);
        const info = stmt.run(req.user.id, title, project, priority, complexity, color);
        res.status(201).json({ id: info.lastInsertRowid, title, completed: false });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao salvar tarefa' });
    }
});

app.put('/api/tasks/:id', authenticateToken, (req, res) => {
    const { title, project, priority, complexity, color, completed } = req.body;
    try {
        const stmt = db.prepare(`
            UPDATE tasks SET title=?, project=?, priority=?, complexity=?, color=?, completed=? 
            WHERE id=? AND user_id=?
        `);
        const result = stmt.run(title, project, priority, complexity, color, completed ? 1 : 0, req.params.id, req.user.id);
        
        if (result.changes === 0) return res.status(404).json({ error: 'Tarefa não encontrada' });
        res.json({ message: 'Tarefa atualizada' });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao atualizar tarefa' });
    }
});

app.delete('/api/tasks/:id', authenticateToken, (req, res) => {
    const result = db.prepare('DELETE FROM tasks WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Tarefa não encontrada' });
    res.status(204).send();
});

// --- COMUNIDADE ---

app.get('/api/posts', (req, res) => {
    const posts = db.prepare(`
        SELECT p.id, p.content, p.created_at as date, u.name as author, u.level 
        FROM posts p
        JOIN users u ON p.user_id = u.id 
        ORDER BY p.created_at DESC
    `).all();
    res.json(posts);
});

app.post('/api/posts', authenticateToken, (req, res) => {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'O conteúdo não pode estar vazio' });
    
    db.prepare('INSERT INTO posts (user_id, content) VALUES (?, ?)').run(req.user.id, content);
    res.status(201).json({ message: 'Post enviado' });
});

// Rota Catch-all para SPA (deve vir por último)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Servidor FlowTask ativo em: http://localhost:${PORT}`));