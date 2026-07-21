## Ideia principal

eu quero criar um serviço de criacao de agentes com ia. Agentes focado em atendimento via whatsapp.

entao inicialmente eu preciso ter um sistema web com um usuario admin que posso convidar outros usuarios.
Eu como admin consigo ter acesso a todos os agentes, mas cada usuário so consegue ter acesso ao seu agente.

O agente nada mais é do que um serviço rodando expondo algum webhook para iniciar o fluxo descrito no prompt.

A plataforma ja deve fornecer o front para integracao com a api de whatsapp. Inicialmente só precisamos ter a integracao com a evolution api, no futuro implementaremos com as outras. Entao toda a parte de pareamento de numero, geracao de qr code, configuracao de webhook deve ser fornecido pela plataforma.

O usuario deve fornecer apenas o endereço e apiKey da evolution api que ele vai usar.

O usuário também deve fornecer qual IA proviter ele vai usar e a chave da API.

Inicialmente ja vamos implementar integracao com chatgpt, google, anthropic e openrouter

## Features.

Para criar um agente, o usuario vai preencher um formulario com:
Nome do agente

Instruções gerais

IA Provider e chave de api

Configuracao de whatsapp

O Webhook e criado automaticamente pela plataforma e após a configuracao com o evolution a api pode fazer um put para ja integrar com o agente.

O agente deve respeitar as regras, se possível já crie uma estrutura básica de prompt para que o usuário só altere o texto.

## Integracoes.

Pretendo incluir algumas integracoes como google agenda, google calender, dentre outras que ainda vou definir.

Nesse MVP eu quero apenas ter certeza que é possivel conversar com o agente.

## Comportamento do agente.

O agente deve ter uma memoria pequena, mas uma memoria para cada conversa que ele teve nos ultimos meses, para que ele possa lembrar de conversas passadas. e nao aprecer um chatbot burro.

Como o brasileiro fala em varias menasgens, o agente deve ter um pool de mensagens para que ele der um tempo suficiente para receber mensagens. Exemplo: ele recebe uma mensagem, espera 1 minuto, se nao chegar mais mensagem, ele envia a resposta. Caso chegue, ele espera mais 1 minuto, se nao chegar mais, ele envia a resposta.

Esse tempo pode ser padrao 1 minuto, mas pode ser tb ajustavel pelo usuário.

## Entregavel inicial.

Sistema para criacao de agentes, telas para criacao, integracao com evolution api, testes de conversacao.

## pensei em usar supabase ou neon db para guardar as informacoes do agente e das conversas.

Monte um plano para isso. Antes de montar grill me com perguntas.
