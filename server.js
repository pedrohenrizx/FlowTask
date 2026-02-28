require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const morgan = require('morgan');
const multer = require('multer');
const { z } = require('zod');
const fs = require('fs');

const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_dev';

// --- CONFIGURAÇÃO DE LOGS (MORGAN) ---
app.use(morgan('dev'));

// --- CONFIGURAÇÃO DE UPLOAD (MULTER) ---
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // Limite de 2MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png/;
        const isValid = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        if (isValid) cb(null, true);
        else cb(new Error('Apenas imagens (jpg, png) são permitidas'));
    }
});

// Middlewares Básicos
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- ESQUEMAS DE VALIDAÇÃO (ZOD) ---
const signupSchema = z.object({
    name: z.string().min(2, "Nome deve ter ao menos 2 caracteres"),
    email: z.string().email("E-mail inválido"),
    password: z.string().min(6, "Senha deve ter ao menos 6 caracteres")
});

const loginSchema = z.object({
    email: z.string().email("E-mail inválido"),
    password: z.string().min(1, "Senha é obrigatória")
});

const taskSchema = z.object({
    title: z.string().min(1, "Título é obrigatório"),
    project: z.string().min(1, "Projeto é obrigatório"),
    priority: z.enum(['baixa', 'media', 'alta']),
    complexity: z.string(),
    color: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, "Cor inválida"),
    completed: z.boolean().optional()
});

const postSchema = z.object({
    content: z.string().min(1, "O conteúdo não pode estar vazio").max(500, "Máximo de 500 caracteres")
});

// Middleware de Autenticação
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Acesso negado' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token inválido ou expirado' });
        req.user = user;
        next();
    });
};

// --- ROTAS DE AUTENTICAÇÃO ---

app.post('/api/auth/signup', (req, res, next) => {
    try {
        const data = signupSchema.parse(req.body);
        const hashedPassword = bcrypt.hashSync(data.password, 10);
        db.prepare('INSERT INTO users (name, email, password) VALUES (?, ?, ?)').run(data.name, data.email, hashedPassword);
        res.status(201).json({ message: 'Usuário criado com sucesso' });
    } catch (e) { next(e); }
});

app.post('/api/auth/login', (req, res, next) => {
    try {
        const data = loginSchema.parse(req.body);
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(data.email);
        
        if (!user || !bcrypt.compareSync(data.password, user.password)) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }
        
        const token = jwt.sign({ id: user.id, name: user.name }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ 
            token, 
            user: { 
                name: user.name, 
                email: user.email,
                level: user.level, 
                profile_image: user.profile_image 
            } 
        });
    } catch (e) { next(e); }
});

// --- ROTAS DE PERFIL ---

app.post('/api/profile/photo', authenticateToken, upload.single('photo'), (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        const photoPath = `/uploads/${req.file.filename}`;
        db.prepare('UPDATE users SET profile_image = ? WHERE id = ?').run(photoPath, req.user.id);
        res.json({ photoUrl: photoPath });
    } catch (e) { next(e); }
});

app.put('/api/profile', authenticateToken, (req, res, next) => {
    try {
        const { name } = req.body;
        if (!name || name.length < 2) return res.status(400).json({ error: 'Nome inválido' });
        db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, req.user.id);
        res.json({ message: 'Perfil atualizado' });
    } catch (e) { next(e); }
});

// --- ROTAS DE TAREFAS ---

app.get('/api/tasks', authenticateToken, (req, res, next) => {
    try {
        const tasks = db.prepare('SELECT * FROM tasks WHERE user_id = ?').all(req.user.id);
        res.json(tasks.map(t => ({ ...t, completed: !!t.completed })));
    } catch (e) { next(e); }
});

app.post('/api/tasks', authenticateToken, (req, res, next) => {
    try {
        const data = taskSchema.parse(req.body);
        const info = db.prepare(`
            INSERT INTO tasks (user_id, title, project, priority, complexity, color, completed) 
            VALUES (?, ?, ?, ?, ?, ?, 0)
        `).run(req.user.id, data.title, data.project, data.priority, data.complexity, data.color);
        res.status(201).json({ id: info.lastInsertRowid, ...data, completed: false });
    } catch (e) { next(e); }
});

app.put('/api/tasks/:id', authenticateToken, (req, res, next) => {
    try {
        const data = taskSchema.parse(req.body);
        const result = db.prepare(`
            UPDATE tasks SET title=?, project=?, priority=?, complexity=?, color=?, completed=? 
            WHERE id=? AND user_id=?
        `).run(data.title, data.project, data.priority, data.complexity, data.color, data.completed ? 1 : 0, req.params.id, req.user.id);
        
        if (result.changes === 0) return res.status(404).json({ error: 'Tarefa não encontrada' });
        res.json({ message: 'Tarefa atualizada' });
    } catch (e) { next(e); }
});

app.delete('/api/tasks/:id', authenticateToken, (req, res, next) => {
    try {
        const result = db.prepare('DELETE FROM tasks WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
        if (result.changes === 0) return res.status(404).json({ error: 'Tarefa não encontrada' });
        res.status(204).send();
    } catch (e) { next(e); }
});

// --- ROTAS DA COMUNIDADE ---

app.get('/api/posts', (req, res, next) => {
    try {
        const posts = db.prepare(`
            SELECT p.id, p.content, p.created_at as date, u.name as author, u.level 
            FROM posts p
            JOIN users u ON p.user_id = u.id 
            ORDER BY p.created_at DESC
        `).all();
        res.json(posts);
    } catch (e) { next(e); }
});

app.post('/api/posts', authenticateToken, (req, res, next) => {
    try {
        const data = postSchema.parse(req.body);
        db.prepare('INSERT INTO posts (user_id, content) VALUES (?, ?)').run(req.user.id, data.content);
        res.status(201).json({ message: 'Post partilhado com sucesso' });
    } catch (e) { next(e); }
});

// --- TRATAMENTO DE ERRO GLOBAL ---
app.use((err, req, res, next) => {
    if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Erro de validação', details: err.errors });
    }
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Erro no upload: ${err.message}` });
    }
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ error: 'Este e-mail já está registado' });
    }
    
    console.error(err.stack);
    res.status(500).json({ error: 'Erro interno do servidor' });
});

// Rota Catch-all para SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Servidor FlowTask ativo em: http://localhost:${PORT}`));
