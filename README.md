Markdown
# 🤖 Bot Telegram: Gestão de Catálogos via FTP

Um bot para Telegram desenvolvido em Node.js que atua como um painel de administração (CMS) headless para um site estático. Ele permite gerenciar fábricas, logos e catálogos em PDF diretamente pelo celular, sincronizando tudo com um servidor FTP (Hostgator/cPanel) em tempo real.

## 🚀 Funcionalidades

- **Adicionar Fábricas (`/fabrica`):** Cadastro completo com nome, segmento, categoria, link, upload de Logo (.png) e geração automática de texto para WhatsApp.
- **Excluir Fábricas (`/deletarfabrica`):** Remoção total e segura (exclui a pasta, a logo, todos os PDFs vinculados e limpa o banco de dados).
- **Adicionar Catálogos (`/novo`):** Upload de PDFs diretamente pelo chat. O bot cria as pastas dinamicamente no servidor e atualiza os links no site.
- **Deletar Catálogos (`/deletar`):** Leitura em tempo real do servidor para listar e apagar catálogos específicos fisicamente e do banco de dados.
- **Sincronização Automática:** Ao reiniciar, o bot faz o download do banco de dados atual (`factories.json`) para reconstruir sua memória interna, garantindo que nunca haja perda de dados.
- **Anti-Hibernação:** Inclui um mini-servidor HTTP embutido para manter o bot rodando 24/7 em plataformas de nuvem gratuitas (como o Render).

## 🛠️ Tecnologias Utilizadas

- **Node.js**
- **Telegraf** (API do Telegram)
- **basic-ftp** (Conexão e manipulação de arquivos no servidor)
- **Axios** (Download de arquivos do Telegram)
- **Render** (Hospedagem em nuvem)

## ⚙️ Como executar o projeto localmente

1. Clone este repositório:
   ```bash
   git clone [https://github.com/SEU-USUARIO/seu-repositorio.git](https://github.com/SEU-USUARIO/seu-repositorio.git)
   
Instale as dependências:

Bash
npm install
Crie um arquivo .env na raiz do projeto com as seguintes variáveis:

Snippet de código
BOT_TOKEN=seu_token_do_telegram_aqui
MEU_CHAT_ID=seu_id_do_telegram_aqui
FTP_HOST=ip_ou_host_do_servidor
FTP_USER=usuario_do_cpanel
FTP_PASS=senha_do_cpanel
Inicie o bot:

Bash
npm start
☁️ Deploy (Render)
Este projeto está configurado para rodar nativamente como um Web Service no Render.
Para evitar a hibernação do plano gratuito, configure um ping a cada 10 minutos para a URL gerada pelo Render usando serviços como o cron-job.org.
