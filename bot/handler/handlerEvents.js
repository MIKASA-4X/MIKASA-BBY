const fs = require("fs-extra");

module.exports = function (api, message, event, parameters) {
    const { GoatBot, utils, globalData } = global;
    const { config } = GoatBot;
    const { threadID, senderID, messageID, body, isGroup } = event;

    // --- User & Thread Data ---
    const userData = parameters.userData || {};
    const threadData = parameters.threadData || {};
    const langCode = threadData.lang || "en";
    const prefix = threadData.prefix || config.prefix || "!";

    // --- Role of User ---
    const role = parameters.role || 0;

    let isUserCallCommand = false;

    // Helper function to remove home dir from stack
    function removeHomeDir(stack) {
        return stack.replace(process.env.HOME || process.env.USERPROFILE, "~");
    }

    // --------------------- ON START ---------------------
    async function onStart() {
        if (!body || !body.startsWith(prefix)) return;

        const dateNow = Date.now();
        const args = body.slice(prefix.length).trim().split(/ +/);
        let commandName = args.shift().toLowerCase();
        let command = GoatBot.commands.get(commandName) || GoatBot.commands.get(GoatBot.aliases.get(commandName));

        // Alias check
        const aliasesData = threadData.data?.aliases || {};
        for (const cmdName in aliasesData) {
            if (aliasesData[cmdName].includes(commandName)) {
                command = GoatBot.commands.get(cmdName);
                commandName = cmdName;
                break;
            }
        }

        if (!command) {
            if (!parameters.hideNotiMessage?.commandNotFound)
                return await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "commandNotFound", commandName, prefix));
            return true;
        }

        // --- Check Permission & VIP ---
        const roleConfig = parameters.getRoleConfig?.(utils, command, isGroup, threadData, commandName) || {};
        const needRole = roleConfig.onStart || 0;

        if (needRole > role) {
            if (needRole === 4) return await message.reply(parameters.getText?.("onlyVIP", null, null, null, langCode));
            if (!parameters.hideNotiMessage?.needRoleToUseCmd) {
                if (needRole === 1) return await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "onlyAdmin", commandName));
                if (needRole === 2) return await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "onlyAdminBot2", commandName));
            }
            return true;
        }

        // --- Cooldown ---
        if (!parameters.client.countDown) parameters.client.countDown = {};
        if (!parameters.client.countDown[commandName]) parameters.client.countDown[commandName] = {};
        const timestamps = parameters.client.countDown[commandName];
        let getCoolDown = command.config.countDown;
        if (!getCoolDown && getCoolDown !== 0 || isNaN(getCoolDown)) getCoolDown = 1;
        const cooldownCommand = getCoolDown * 1000;

        if (timestamps[senderID]) {
            const expirationTime = timestamps[senderID] + cooldownCommand;
            if (dateNow < expirationTime)
                return await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "waitingForCommand", ((expirationTime - dateNow) / 1000).toFixed(1)));
        }

        // --- Run Command ---
        isUserCallCommand = true;
        try {
            const getText2 = parameters.createGetText2?.(langCode, `${process.cwd()}/languages/cmds/${langCode}.js`, prefix, command);
            await command.onStart({
                ...parameters,
                args,
                commandName,
                getLang: getText2
            });
            timestamps[senderID] = dateNow;
        } catch (err) {
            await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "errorOccurred", new Date().toLocaleString(), commandName, removeHomeDir(err.stack || err.message)));
        }
    }

    // --------------------- ON CHAT ---------------------
    async function onChat() {
        const allOnChat = GoatBot.onChat || [];
        const args = body ? body.split(/ +/) : [];

        for (const key of allOnChat) {
            const command = GoatBot.commands.get(key);
            if (!command) continue;
            const commandName = command.config.name;

            const roleConfig = parameters.getRoleConfig?.(utils, command, isGroup, threadData, commandName) || {};
            const needRole = roleConfig.onChat || 0;
            if (needRole > role) continue;

            const getText2 = parameters.createGetText2?.(langCode, `${process.cwd()}/languages/cmds/${langCode}.js`, prefix, command);
            if (typeof command.onChat === "function") {
                await command.onChat({
                    ...parameters,
                    isUserCallCommand,
                    args,
                    commandName,
                    getLang: getText2
                }).catch(err => console.error(err));
            }
        }
    }

    // --------------------- ON REPLY ---------------------
    async function onReply() {
        if (!event.messageReply) return;
        const Reply = GoatBot.onReply.get(event.messageReply.messageID);
        if (!Reply) return;

        const commandName = Reply.commandName;
        if (!commandName) return log.err("onReply", "Can't find command name", Reply);

        const command = GoatBot.commands.get(commandName);
        if (!command) return log.err("onReply", `Command ${commandName} not found`, Reply);

        const roleConfig = parameters.getRoleConfig?.(utils, command, isGroup, threadData, commandName) || {};
        const needRole = roleConfig.onReply || 0;

        if (needRole > role) {
            if (needRole === 4) return await message.reply(parameters.getText?.("onlyVIP", null, null, null, langCode));
            return true;
        }

        const getText2 = parameters.createGetText2?.(langCode, `${process.cwd()}/languages/cmds/${langCode}.js`, prefix, command);
        const args = body ? body.split(/ +/) : [];
        await command.onReply({
            ...parameters,
            Reply,
            args,
            commandName,
            getLang: getText2
        }).catch(err => console.error(err));
    }

    // --------------------- ON REACTION ---------------------
    async function onReaction() {
        const Reaction = GoatBot.onReaction.get(messageID);
        if (!Reaction) return;

        const commandName = Reaction.commandName;
        if (!commandName) return log.err("onReaction", "Can't find command name", Reaction);

        const command = GoatBot.commands.get(commandName);
        if (!command) return log.err("onReaction", `Command ${commandName} not found`, Reaction);

        const roleConfig = parameters.getRoleConfig?.(utils, command, isGroup, threadData, commandName) || {};
        const needRole = roleConfig.onReaction || 0;

        if (needRole > role) {
            if (needRole === 4) return await message.reply(parameters.getText?.("onlyVIP", null, null, null, langCode));
            return true;
        }

        const getText2 = parameters.createGetText2?.(langCode, `${process.cwd()}/languages/cmds/${langCode}.js`, prefix, command);
        await command.onReaction({
            ...parameters,
            Reaction,
            args: [],
            commandName,
            getLang: getText2
        }).catch(err => console.error(err));
    }

    // --------------------- ON EVENT ---------------------
    async function onEvent() {
        const allOnEvent = GoatBot.onEvent || [];
        for (const key of allOnEvent) {
            const command = GoatBot.commands.get(key);
            if (!command) continue;
            const commandName = command.config.name;
            const getText2 = parameters.createGetText2?.(langCode, `${process.cwd()}/languages/events/${langCode}.js`, prefix, command);
            if (typeof command.onEvent === "function") {
                await command.onEvent({
                    ...parameters,
                    args: [],
                    commandName,
                    getLang: getText2
                }).catch(err => console.error(err));
            }
        }
    }

    // --------------------- OTHER EVENTS PLACEHOLDERS ---------------------
    async function presence() { }
    async function read_receipt() { }
    async function typ() { }

    // --------------------- EXPORT ---------------------
    return {
        onStart,
        onChat,
        onReply,
        onReaction,
        onEvent,
        presence,
        read_receipt,
        typ
    };
};
