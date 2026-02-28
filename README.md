FlowTask - Foco e Produtividade

Este é o projeto FlowTask, uma aplicação de gestão de tarefas com cronômetro Pomodoro e rede social integrados.

Estrutura do Projeto

server.js: Servidor Express com endpoints da API e autenticação JWT.

database.js: Configuração e inicialização do banco de dados SQLite.

public/: Pasta contendo o front-end (index.html).

flowtask.db: Arquivo do banco de dados SQLite (gerado automaticamente).

Funcionalidades Back-end

Autenticação: Registro e Login de usuários com senhas criptografadas (bcrypt) e sessões seguras (JWT).

Tarefas (CRUD): Gestão completa de tarefas por usuário.

Comunidade: Feed de postagens global onde usuários compartilham progresso.

Segurança: Middlewares de proteção de rota e sanitização de queries com better-sqlite3.

Como Executar

Certifique-se de ter o Node.js instalado.

Crie uma pasta para o projeto e coloque os arquivos gerados.

Coloque o seu arquivo index.html dentro de uma pasta chamada public.

Abra o terminal na pasta raiz e instale as dependências:

npm install


Inicie o servidor:

npm start


Acesse a aplicação em: http://localhost:3000

API Endpoints

Método

Rota

Descrição

POST

/api/auth/signup

Criar nova conta

POST

/api/auth/login

Login e geração de Token

GET

/api/tasks

Listar tarefas do usuário logado

POST

/api/tasks

Criar nova tarefa

PUT

/api/tasks/:id

Atualizar tarefa (status, título, etc)

GET

/api/posts

Feed da comunidade

POST

/api/posts

Publicar no feed
