require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ftp = require('basic-ftp'); 

const bot = new Telegraf(process.env.BOT_TOKEN);
const MEU_CHAT_ID = parseInt(process.env.MEU_CHAT_ID);

const CAMINHO_BASE = '/amcaser.com.br';
const CAMINHO_JSON = `${CAMINHO_BASE}/js/factories.json`; // Ajuste se não usar a pasta /js

let estadoSessao = {
    etapa: 'LIVRE',
    fabricaId: null,
    fabricaNomePasta: null,
    nomeCatalogo: null,
    novaFabrica: {} 
};

// Agora a lista começa vazia, pois será preenchida automaticamente pelo servidor
let fabricasDisponiveis = [];

bot.use((ctx, next) => {
    if (ctx.from && ctx.from.id !== MEU_CHAT_ID) return;
    return next();
});

// ==========================================
// 1. COMANDOS PRINCIPAIS
// ==========================================

bot.command('novo', (ctx) => {
    estadoSessao.etapa = 'LIVRE'; 
    const botoes = fabricasDisponiveis.map(f => Markup.button.callback(`➕ ${f.name}`, `ADD_FABRICA_${f.id}`));
    ctx.reply('Para qual fábrica você quer ADICIONAR um catálogo?', Markup.inlineKeyboard(botoes, { columns: 2 }));
});

bot.command('deletar', (ctx) => {
    estadoSessao.etapa = 'LIVRE'; 
    const botoes = fabricasDisponiveis.map(f => Markup.button.callback(`🗑️ Catálogo de ${f.name}`, `DEL_FABRICA_${f.id}`));
    ctx.reply('De qual fábrica você quer DELETAR um catálogo específico?', Markup.inlineKeyboard(botoes, { columns: 2 }));
});

bot.command('fabrica', (ctx) => {
    estadoSessao.etapa = 'ESPERANDO_NOME_FABRICA';
    estadoSessao.novaFabrica = {}; 
    ctx.reply('🏢 Vamos cadastrar uma NOVA FÁBRICA!\n\nQual é o NOME da fábrica que vai aparecer no site?');
});

bot.command('deletarfabrica', (ctx) => {
    estadoSessao.etapa = 'LIVRE';
    const botoes = fabricasDisponiveis.map(f => Markup.button.callback(`🔥 ${f.name}`, `DEL_ALL_FABRICA_${f.id}`));
    ctx.reply('Qual fábrica você quer EXCLUIR COMPLETAMENTE do site?', Markup.inlineKeyboard(botoes, { columns: 2 }));
});

// ==========================================
// 2. AÇÕES DOS BOTÕES (Clicks)
// ==========================================

bot.action(/ADD_FABRICA_(\d+)/, (ctx) => {
    const idEscolhido = parseInt(ctx.match[1]);
    const fabrica = fabricasDisponiveis.find(f => f.id === idEscolhido);
    if (fabrica) {
        estadoSessao.fabricaId = fabrica.id;
        estadoSessao.fabricaNomePasta = fabrica.pasta;
        estadoSessao.etapa = 'ESPERANDO_NOME';
        ctx.answerCbQuery();
        ctx.reply(`Fábrica: **${fabrica.name}**.\nQual o NOME DO CATÁLOGO?`);
    }
});

bot.action(/DEL_FABRICA_(\d+)/, async (ctx) => {
    const idEscolhido = parseInt(ctx.match[1]);
    const fabrica = fabricasDisponiveis.find(f => f.id === idEscolhido);
    if (fabrica) {
        ctx.answerCbQuery();
        const msg = await ctx.reply(`Buscando catálogos de **${fabrica.name}**...`);
        const client = new ftp.Client();
        try {
            await client.access({ host: process.env.FTP_HOST, user: process.env.FTP_USER, password: process.env.FTP_PASS });
            const tempJsonPath = path.join(__dirname, 'temp_factories.json');
            await client.downloadTo(tempJsonPath, CAMINHO_JSON);
            let dadosSite = JSON.parse(fs.readFileSync(tempJsonPath, 'utf8'));
            fs.unlinkSync(tempJsonPath);
            client.close();

            const fabricaDados = dadosSite.find(f => f.id === idEscolhido);
            if (!fabricaDados || !fabricaDados.catalogs || fabricaDados.catalogs.length === 0) {
                return ctx.reply(`A fábrica ${fabrica.name} não possui nenhum catálogo cadastrado.`);
            }

            const botoesCatalogos = fabricaDados.catalogs.map((cat, index) => 
                Markup.button.callback(`❌ ${cat.name}`, `EXCLUIR_${idEscolhido}_${index}`)
            );
            ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id); 
            ctx.reply(`Selecione o catálogo para excluir:`, Markup.inlineKeyboard(botoesCatalogos, { columns: 1 }));
        } catch (error) {
            client.close();
            ctx.reply(`❌ Erro ao ler FTP.`);
        }
    }
});

bot.action(/EXCLUIR_(\d+)_(\d+)/, async (ctx) => {
    const fabricaId = parseInt(ctx.match[1]);
    const indexCatalogo = parseInt(ctx.match[2]);
    ctx.answerCbQuery();
    ctx.reply('Excluindo catálogo...');
    const client = new ftp.Client();
    try {
        await client.access({ host: process.env.FTP_HOST, user: process.env.FTP_USER, password: process.env.FTP_PASS });
        const tempJsonPath = path.join(__dirname, 'temp_factories.json');
        await client.downloadTo(tempJsonPath, CAMINHO_JSON);
        let dadosSite = JSON.parse(fs.readFileSync(tempJsonPath, 'utf8'));
        const indexFabrica = dadosSite.findIndex(f => f.id === fabricaId);

        if (indexFabrica !== -1 && dadosSite[indexFabrica].catalogs[indexCatalogo]) {
            const catalogoRemovido = dadosSite[indexFabrica].catalogs.splice(indexCatalogo, 1)[0];
            const caminhoPdfServidor = `${CAMINHO_BASE}/${catalogoRemovido.link}`;
            try { await client.remove(caminhoPdfServidor); } catch (e) {}
            fs.writeFileSync(tempJsonPath, JSON.stringify(dadosSite, null, 2));
            await client.uploadFrom(tempJsonPath, CAMINHO_JSON);
            ctx.reply(`✅ Catálogo "${catalogoRemovido.name}" excluído!`);
        }
        if (fs.existsSync(tempJsonPath)) fs.unlinkSync(tempJsonPath);
    } catch (error) {
        ctx.reply(`❌ Erro: ${error.message}`);
    } finally {
        client.close();
    }
});

bot.action(/DEL_ALL_FABRICA_(\d+)/, (ctx) => {
    const idEscolhido = parseInt(ctx.match[1]);
    const fabrica = fabricasDisponiveis.find(f => f.id === idEscolhido);
    if (fabrica) {
        estadoSessao.fabricaId = fabrica.id; 
        ctx.answerCbQuery();
        
        const botoesConfirmacao = [
            Markup.button.callback('✅ SIM, Excluir Tudo', 'CONFIRMA_DEL_FABRICA'),
            Markup.button.callback('❌ NÃO, Cancelar', 'CANCELA_DEL_FABRICA')
        ];
        
        ctx.reply(`⚠️ **ATENÇÃO!**\nVocê está prestes a excluir a fábrica **${fabrica.name}** do site.\n\nIsso vai deletar:\n- A Logo\n- A Pasta da fábrica\n- Todos os PDFs.\n\nTem certeza absoluta disso?`, Markup.inlineKeyboard(botoesConfirmacao, { columns: 1 }));
    }
});

bot.action('CANCELA_DEL_FABRICA', (ctx) => {
    estadoSessao.fabricaId = null;
    ctx.answerCbQuery();
    ctx.reply('Ufa! Operação cancelada. A fábrica está a salvo.');
});

bot.action('CONFIRMA_DEL_FABRICA', async (ctx) => {
    ctx.answerCbQuery();
    await ctx.reply('Iniciando a remoção total da fábrica no servidor...');
    
    const client = new ftp.Client();
    try {
        await client.access({ host: process.env.FTP_HOST, user: process.env.FTP_USER, password: process.env.FTP_PASS });
        const tempJsonPath = path.join(__dirname, 'temp_factories.json');
        await client.downloadTo(tempJsonPath, CAMINHO_JSON);
        let dadosSite = JSON.parse(fs.readFileSync(tempJsonPath, 'utf8'));
        
        const indexFabrica = dadosSite.findIndex(f => f.id === estadoSessao.fabricaId);
        
        if (indexFabrica !== -1) {
            const fabricaAlvo = dadosSite[indexFabrica];
            
            if (fabricaAlvo.logo) {
                try { await client.remove(`${CAMINHO_BASE}/${fabricaAlvo.logo}`); } catch (e) {}
            }

            if (fabricaAlvo.catalogs && fabricaAlvo.catalogs.length > 0) {
                for (let cat of fabricaAlvo.catalogs) {
                    try { await client.remove(`${CAMINHO_BASE}/${cat.link}`); } catch (e) {}
                }
            }

            const fabricaNaMemoria = fabricasDisponiveis.find(f => f.id === estadoSessao.fabricaId);
            if (fabricaNaMemoria) {
                try { await client.removeDir(`${CAMINHO_BASE}/assets/catalogos/${fabricaNaMemoria.pasta}`); } catch (e) {}
            }

            dadosSite.splice(indexFabrica, 1);
            fs.writeFileSync(tempJsonPath, JSON.stringify(dadosSite, null, 2));
            await client.uploadFrom(tempJsonPath, CAMINHO_JSON);
            
            fabricasDisponiveis = fabricasDisponiveis.filter(f => f.id !== estadoSessao.fabricaId);
            await ctx.reply(`✅ SUCESSO! A fábrica "${fabricaAlvo.name}" foi completamente removida.`);
        } else {
            await ctx.reply('⚠️ Erro: A fábrica não foi encontrada.');
        }
        if (fs.existsSync(tempJsonPath)) fs.unlinkSync(tempJsonPath);
    } catch (error) {
        await ctx.reply(`❌ Erro crítico: ${error.message}`);
    } finally {
        client.close();
        estadoSessao.fabricaId = null;
    }
});

bot.action(/CAT_(.+)/, (ctx) => {
    if (estadoSessao.etapa === 'ESPERANDO_CATEGORIA_FABRICA') {
        estadoSessao.novaFabrica.category = ctx.match[1];
        estadoSessao.etapa = 'ESPERANDO_LOGO_FABRICA';
        ctx.answerCbQuery();
        ctx.reply(`Categoria "${estadoSessao.novaFabrica.category}" selecionada!\n\nPara finalizar, envie a LOGO da fábrica (Formato .PNG).\n\n⚠️ Lembre-se: Envie como ARQUIVO (Documento).`);
    }
});

// ==========================================
// 3. CAPTURA DE TEXTOS E ARQUIVOS
// ==========================================

bot.on('text', async (ctx) => {
    if (estadoSessao.etapa === 'ESPERANDO_NOME') {
        estadoSessao.nomeCatalogo = ctx.message.text;
        estadoSessao.etapa = 'ESPERANDO_PDF';
        ctx.reply(`Nome salvo: "${estadoSessao.nomeCatalogo}".\nEnvie o arquivo PDF.`);
    } else if (estadoSessao.etapa === 'ESPERANDO_NOME_FABRICA') {
        estadoSessao.novaFabrica.name = ctx.message.text;
        estadoSessao.etapa = 'ESPERANDO_SEGMENTO_FABRICA';
        ctx.reply(`Nome salvo!\n\nAgora digite a DESCRIÇÃO (Segmento):\n(Ex: Móveis para quarto e sala)`);
    } else if (estadoSessao.etapa === 'ESPERANDO_SEGMENTO_FABRICA') {
        estadoSessao.novaFabrica.segment = ctx.message.text;
        estadoSessao.etapa = 'ESPERANDO_URL_FABRICA';
        ctx.reply(`Descrição salva!\n\nAgora digite a URL DO SITE da fábrica:\n(Ex: https://www.gelius.com.br)`);
    } else if (estadoSessao.etapa === 'ESPERANDO_URL_FABRICA') {
        estadoSessao.novaFabrica.siteUrl = ctx.message.text;
        estadoSessao.etapa = 'ESPERANDO_CATEGORIA_FABRICA';
        const botoesCategorias = [
            Markup.button.callback('Móveis', 'CAT_moveis'), Markup.button.callback('Colchões', 'CAT_colchoes'),
            Markup.button.callback('Eletros', 'CAT_eletros'), Markup.button.callback('Estofados', 'CAT_estofados'),
            Markup.button.callback('Baby', 'CAT_baby'), Markup.button.callback('Utilidades', 'CAT_utilidades')
        ];
        ctx.reply('URL salva!\n\nEscolha a CATEGORIA da fábrica abaixo:', Markup.inlineKeyboard(botoesCategorias, { columns: 2 }));
    } else if (estadoSessao.etapa === 'LIVRE') {
        ctx.reply('Comandos:\n/novo - Add catálogo\n/deletar - Del catálogo\n/fabrica - Nova fábrica\n/deletarfabrica - Excluir fábrica');
    }
});

bot.on('document', async (ctx) => {
    const document = ctx.message.document;

    if (estadoSessao.etapa === 'ESPERANDO_PDF') {
        if (document.mime_type !== 'application/pdf') return ctx.reply('Envie apenas PDFs.');
        try {
            await ctx.reply('Baixando PDF temporariamente no seu PC...');
            const fileLink = await ctx.telegram.getFileLink(document.file_id);
            const response = await axios({ url: fileLink.href, method: 'GET', responseType: 'stream' });

            const nomeArquivoLimpo = document.file_name.replace(/\s+/g, '_').toLowerCase();
            const tempFilePath = path.join(__dirname, nomeArquivoLimpo);
            const writer = fs.createWriteStream(tempFilePath);
            response.data.pipe(writer);

            await new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });

            await ctx.reply(`✅ PDF baixado. Iniciando envio FTP...`);
            const client = new ftp.Client();
            try {
                await client.access({ host: process.env.FTP_HOST, user: process.env.FTP_USER, password: process.env.FTP_PASS });
                const caminhoPastaDestino = `${CAMINHO_BASE}/assets/catalogos/${estadoSessao.fabricaNomePasta}`;
                await client.ensureDir(caminhoPastaDestino);
                await client.uploadFrom(tempFilePath, `${caminhoPastaDestino}/${nomeArquivoLimpo}`);

                const tempJsonPath = path.join(__dirname, 'temp_factories.json');
                await client.downloadTo(tempJsonPath, CAMINHO_JSON);
                let dadosSite = JSON.parse(fs.readFileSync(tempJsonPath, 'utf8'));
                
                const indexFabrica = dadosSite.findIndex(f => f.id === estadoSessao.fabricaId);
                if (indexFabrica !== -1) {
                    dadosSite[indexFabrica].catalogs.push({
                        name: estadoSessao.nomeCatalogo,
                        link: `assets/catalogos/${estadoSessao.fabricaNomePasta}/${nomeArquivoLimpo}`
                    });
                    fs.writeFileSync(tempJsonPath, JSON.stringify(dadosSite, null, 2));
                    await client.uploadFrom(tempJsonPath, CAMINHO_JSON);
                    await ctx.reply(`🎉 Catálogo "${estadoSessao.nomeCatalogo}" adicionado!`);
                }
                fs.unlinkSync(tempFilePath);
                fs.unlinkSync(tempJsonPath);
            } catch (error) {
                await ctx.reply(`❌ Erro FTP: ${error.message}`);
            } finally { client.close(); estadoSessao.etapa = 'LIVRE'; }
        } catch (error) { await ctx.reply('Erro ao processar PDF.'); estadoSessao.etapa = 'LIVRE'; }
    
    } else if (estadoSessao.etapa === 'ESPERANDO_LOGO_FABRICA') {
        if (document.mime_type !== 'image/png') return ctx.reply('⚠️ O arquivo precisa ser um .PNG');
        try {
            await ctx.reply('Processando a logo no seu PC...');
            const fileLink = await ctx.telegram.getFileLink(document.file_id);
            const response = await axios({ url: fileLink.href, method: 'GET', responseType: 'stream' });

            const nomeArquivoLimpo = document.file_name.replace(/\s+/g, '_').toLowerCase();
            const tempFilePath = path.join(__dirname, nomeArquivoLimpo);
            const writer = fs.createWriteStream(tempFilePath);
            response.data.pipe(writer);

            await new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });

            await ctx.reply(`✅ Logo baixada. Criando a fábrica no site...`);
            const client = new ftp.Client();
            try {
                await client.access({ host: process.env.FTP_HOST, user: process.env.FTP_USER, password: process.env.FTP_PASS });
                const caminhoLogos = `${CAMINHO_BASE}/assets/logos`;
                await client.ensureDir(caminhoLogos);
                await client.uploadFrom(tempFilePath, `${caminhoLogos}/${nomeArquivoLimpo}`);

                const tempJsonPath = path.join(__dirname, 'temp_factories.json');
                await client.downloadTo(tempJsonPath, CAMINHO_JSON);
                let dadosSite = JSON.parse(fs.readFileSync(tempJsonPath, 'utf8'));
                
                const maiorIdAtual = Math.max(...dadosSite.map(f => f.id), 0);
                const novoId = maiorIdAtual + 1;
                const nomePasta = estadoSessao.novaFabrica.name.replace(/\s+/g, '_').toLowerCase();
                
                const novaFabricaObjeto = {
                    id: novoId,
                    name: estadoSessao.novaFabrica.name,
                    pasta: nomePasta, // Agora salvamos o nome da pasta direto no JSON também!
                    logo: `assets/logos/${nomeArquivoLimpo}`,
                    segment: estadoSessao.novaFabrica.segment,
                    category: estadoSessao.novaFabrica.category,
                    catalogs: [], 
                    siteUrl: estadoSessao.novaFabrica.siteUrl,
                    whatsappText: `Olá, gostaria de saber as condições da linha ${estadoSessao.novaFabrica.name}.`
                };

                dadosSite.push(novaFabricaObjeto);
                fs.writeFileSync(tempJsonPath, JSON.stringify(dadosSite, null, 2));
                await client.uploadFrom(tempJsonPath, CAMINHO_JSON);
                
                fabricasDisponiveis.push({ id: novoId, name: novaFabricaObjeto.name, pasta: nomePasta });

                await ctx.reply(`🎉 FÁBRICA ADICIONADA COM SUCESSO!\n\nFábrica: ${novaFabricaObjeto.name}`);
                fs.unlinkSync(tempFilePath);
                fs.unlinkSync(tempJsonPath);
            } catch (error) {
                await ctx.reply(`❌ Erro no FTP ao criar fábrica: ${error.message}`);
            } finally { client.close(); estadoSessao.etapa = 'LIVRE'; }
        } catch (error) { await ctx.reply('Erro ao baixar a logo.'); estadoSessao.etapa = 'LIVRE'; }
    } else {
        await ctx.reply('Não estava esperando nenhum arquivo no momento.');
    }
});

// ==========================================
// 5. INICIALIZAÇÃO E SINCRONIZAÇÃO (NOVO)
// ==========================================

async function inicializarBot() {
    console.log('🔄 Sincronizando banco de dados com o servidor Hostgator...');
    const client = new ftp.Client();
    try {
        await client.access({ host: process.env.FTP_HOST, user: process.env.FTP_USER, password: process.env.FTP_PASS });
        const tempJsonPath = path.join(__dirname, 'temp_init_factories.json');
        await client.downloadTo(tempJsonPath, CAMINHO_JSON);
        
        let dadosSite = JSON.parse(fs.readFileSync(tempJsonPath, 'utf8'));
        
        // Reconstrói a lista mapeando as pastas de forma inteligente
        fabricasDisponiveis = dadosSite.map(f => {
            let pasta = f.pasta;
            if (!pasta) {
                // Se a fábrica for antiga e não tiver a propriedade 'pasta', tenta extrair do link do PDF
                if (f.catalogs && f.catalogs.length > 0) {
                    pasta = f.catalogs[0].link.split('/')[2];
                } else {
                    pasta = f.name.replace(/\s+/g, '_').toLowerCase();
                }
            }
            return { id: f.id, name: f.name, pasta: pasta };
        });
        
        fs.unlinkSync(tempJsonPath);
        console.log(`✅ Sincronização completa! ${fabricasDisponiveis.length} fábricas carregadas.`);
    } catch (error) {
        console.error('❌ Erro ao sincronizar fábricas no início:', error.message);
        console.log('⚠️ Usando lista de backup em memória para não travar o bot.');
        fabricasDisponiveis = [
            { id: 1, name: 'Elgin', pasta: 'elgin' }, { id: 2, name: 'Gelius Móveis', pasta: 'gelius' },
            { id: 3, name: 'Reconflex', pasta: 'reconflex' }, { id: 4, name: 'Bertolini', pasta: 'bertolini' },
            { id: 5, name: 'Realce', pasta: 'realce' }, { id: 6, name: 'Duo', pasta: 'duo' },
            { id: 7, name: 'Mundial Estofados', pasta: 'mundial' }, { id: 8, name: 'EDN Móveis', pasta: 'edn' },
            { id: 9, name: 'LJ Móveis', pasta: 'lj_móveis' }, { id: 10, name: 'Permobili Baby', pasta: 'permobili_baby' },
            { id: 11, name: 'MGM', pasta: 'mgm' }, { id: 12, name: 'Helena Estofados', pasta: 'eh' },
            { id: 13, name: 'Luciane Cozinhas', pasta: 'luciane' }
        ];
    } finally {
        client.close();
        bot.launch().then(() => console.log('🤖 Bot online! Mande comandos no Telegram.'));
    }
}

// Inicia todo o processo
inicializarBot();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Web Service - Mini Servidor para manter o bot ativo em plataformas como render.com
const http = require('http');
const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write('Bot de Catalogos operando normalmente!');
    res.end();
}).listen(PORT, () => {
    console.log(`🌐 Servidor Web rodando na porta ${PORT}`);
});