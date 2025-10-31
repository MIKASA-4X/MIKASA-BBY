const fs = require("fs-extra");
const nullAndUndefined = [undefined, null];

// Function to get the type of an object
function getType(obj) {
    return Object.prototype.toString.call(obj).slice(8, -1);
}

// Function to get the role of a user in the thread
function getRole(threadData, senderID) {
    const adminBot = global.GoatBot.config.adminBot || [];
    if (!senderID) return 0;
    const adminBox = threadData ? threadData.adminIDs || [] : [];
    const vipMembers = threadData ? threadData.vipMembers || [] : []; // VIP members array

    if (adminBot.includes(senderID)) return 2;
    if (adminBox.includes(senderID)) return 1;
    if (vipMembers.includes(senderID)) return 4; // VIP role assigned to 4
    return 0;
}

// Function to get the text for messages
function getText(type, reason, time, targetID, lang) {
    const utils = global.utils;
    if (type == "userBanned")
        return utils.getText({ lang, head: "handlerEvents" }, "userBanned", reason, time, targetID);
    else if (type == "threadBanned")
        return utils.getText({ lang, head: "handlerEvents" }, "threadBanned", reason, time, targetID);
    else if (type == "onlyAdminBox")
        return utils.getText({ lang, head: "handlerEvents" }, "onlyAdminBox");
    else if (type == "onlyAdminBot")
        return utils.getText({ lang, head: "handlerEvents" }, "onlyAdminBot");
}

// Function to replace shortcut keys in languages
function replaceShortcutInLang(text, prefix, commandName) {
    return text
        .replace(/\{(?:p|prefix)\}/g, prefix)
        .replace(/\{(?:n|name)\}/g, commandName)
        .replace(/\{pn\}/g, `${prefix}${commandName}`);
}

// Function to get the role config for a command
function getRoleConfig(utils, command, isGroup, threadData, commandName) {
    let roleConfig;
    if (utils.isNumber(command.config.role)) {
        roleConfig = {
            onStart: command.config.role
        };
    } else if (typeof command.config.role == "object" && !Array.isArray(command.config.role)) {
        if (!command.config.role.onStart) command.config.role.onStart = 0;
        roleConfig = command.config.role;
    } else {
        roleConfig = {
            onStart: 0
        };
    }

    if (isGroup) roleConfig.onStart = threadData.data.setRole?.[commandName] ?? roleConfig.onStart;

    for (const key of ["onChat", "onStart", "onReaction", "onReply"]) {
        if (roleConfig[key] == undefined) roleConfig[key] = roleConfig.onStart;
    }

    return roleConfig;
}

// Function to check if the user is banned or has limited permissions
function isBannedOrOnlyAdmin(userData, threadData, senderID, threadID, isGroup, commandName, message, lang) {
    const config = global.GoatBot.config;
    const { adminBot, hideNotiMessage } = config;

    // Check if user banned
    const infoBannedUser = userData.banned;
    if (infoBannedUser.status == true) {
        const { reason, date } = infoBannedUser;
        if (hideNotiMessage.userBanned == false)
            message.reply(getText("userBanned", reason, date, senderID, lang));
        return true;
    }

    // Check if only admin bot
    if (
        config.adminOnly.enable == true &&
        !adminBot.includes(senderID) &&
        !config.adminOnly.ignoreCommand.includes(commandName)
    ) {
        if (hideNotiMessage.adminOnly == false)
            message.reply(getText("onlyAdminBot", null, null, null, lang));
        return true;
    }

    // Check if thread is restricted to admins
    if (isGroup == true) {
        if (
            threadData.data.onlyAdminBox === true &&
            !threadData.adminIDs.includes(senderID) &&
            !(threadData.data.ignoreCommanToOnlyAdminBox || []).includes(commandName)
        ) {
            if (!threadData.data.hideNotiMessageOnlyAdminBox)
                message.reply(getText("onlyAdminBox", null, null, null, lang));
            return true;
        }

        // Check if thread banned
        const infoBannedThread = threadData.banned;
        if (infoBannedThread.status == true) {
            const { reason, date } = infoBannedThread;
            if (hideNotiMessage.threadBanned == false)
                message.reply(getText("threadBanned", reason, date, threadID, lang));
            return true;
        }
    }
    return false;
}

// Create getText function with custom language handling
function createGetText2(langCode, pathCustomLang, prefix, command) {
    const commandType = command.config.countDown ? "command" : "command event";
    const commandName = command.config.name;
    let customLang = {};
    let getText2 = () => { };
    if (fs.existsSync(pathCustomLang))
        customLang = require(pathCustomLang)[commandName]?.text || {};
    if (command.langs || customLang || {}) {
        getText2 = function (key, ...args) {
            let lang = command.langs?.[langCode]?.[key] || customLang[key] || "";
            lang = replaceShortcutInLang(lang, prefix, commandName);
            for (let i = args.length - 1; i >= 0; i--)
                lang = lang.replace(new RegExp(`%${i + 1}`, "g"), args[i]);
            return lang || `❌ Can't find text on language "${langCode}" for ${commandType} "${commandName}" with key "${key}"`;
        };
    }
    return getText2;
}

// Function to add VIP users
function addVIPUser(threadID, senderID) {
    let threadData = global.db.allThreadData.find(t => t.threadID == threadID);
    if (!threadData.vipMembers) {
        threadData.vipMembers = [];
    }
    if (!threadData.vipMembers.includes(senderID)) {
        threadData.vipMembers.push(senderID);
    }
}

// Main function handling the event system
module.exports = function (api, threadModel, userModel, dashBoardModel, globalModel, usersData, threadsData, dashBoardData, globalData) {
    return async function (event, message) {

        const { utils, client, GoatBot } = global;
        const { getPrefix, removeHomeDir, log, getTime } = utils;
        const { config, configCommands: { envGlobal, envCommands, envEvents } } = GoatBot;
        const { autoRefreshThreadInfoFirstTime } = config.database;
        let { hideNotiMessage = {} } = config;

        const { body, messageID, threadID, isGroup } = event;

        if (!threadID) return;

        const senderID = event.userID || event.senderID || event.author;

        let threadData = global.db.allThreadData.find(t => t.threadID == threadID);
        let userData = global.db.allUserData.find(u => u.userID == senderID);

        if (!userData && !isNaN(senderID)) userData = await usersData.create(senderID);
        if (!threadData && !isNaN(threadID)) {
            if (global.temp.createThreadDataError.includes(threadID)) return;
            threadData = await threadsData.create(threadID);
            global.db.receivedTheFirstMessage[threadID] = true;
        }
        else {
            if (autoRefreshThreadInfoFirstTime === true && !global.db.receivedTheFirstMessage[threadID]) {
                global.db.receivedTheFirstMessage[threadID] = true;
                await threadsData.refreshInfo(threadID);
            }
        }

        if (typeof threadData.settings.hideNotiMessage == "object") hideNotiMessage = threadData.settings.hideNotiMessage;

        const prefix = getPrefix(threadID);
        const role = getRole(threadData, senderID);
        const langCode = threadData.data.lang || config.language || "en";
        const parameters = { api, usersData, threadsData, message, event, userModel, threadModel, prefix, dashBoardModel, globalModel, dashBoardData, globalData, envCommands, envEvents, envGlobal, role };

        const commandName = body.slice(prefix.length).trim().split(/ +/).shift().toLowerCase();
        let command = GoatBot.commands.get(commandName) || GoatBot.commands.get(GoatBot.aliases.get(commandName));

        if (isBannedOrOnlyAdmin(userData, threadData, senderID, threadID, isGroup, commandName, message, langCode)) return;

        // VIP check
        if (command.config.role === 4 && role !== 4) {
            return await message.reply("you are not VIP User baby 🥹");
        }

        // Permissions check
        const roleConfig = getRoleConfig(utils, command, isGroup, threadData, commandName);
        const needRole = roleConfig.onStart;
        if (needRole == 4 && role !== 4) {
            return await message.reply
