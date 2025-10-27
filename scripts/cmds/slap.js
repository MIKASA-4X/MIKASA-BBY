const DIG = require("discord-image-generation");
const fs = require("fs-extra");

// Since slap.js and vip.json are in the same folder
const vipFilePath = __dirname + "/vip.json";

module.exports = {
  config: {
    name: "slap",
    version: "2.2",
    author: "Saif",
    countDown: 5,
    role: 0, // all VIP users can use
    shortDescription: "Batslap image",
    longDescription: "Create Batslap meme with tagged, replied or random user",
    category: "image",
    guide: { en: "{pn} @tag\n{pn} random | rnd | r | reply" }
  },

  onStart: async function({ event, message, usersData, args, api }) {
    // Load VIP data
    let vipList = {};
    try {
      vipList = JSON.parse(fs.readFileSync(vipFilePath, "utf-8"));
    } catch (err) {
      console.error("Error loading VIP data:", err);
    }

    const senderUID = event.senderID;
    const vipInfo = vipList[senderUID];

    // VIP + validity check
    if (!vipInfo || new Date(vipInfo.expiresAt) < new Date()) {
      return message.reply("⚠️ Sorry, this command is VIP-only. You are not a VIP 😿");
    }

    let uid1 = senderUID;
    let uid2 = null;
    const content = args.join(" ");

    // Reply user check
    if (event.messageReply?.senderID) {
      uid2 = event.messageReply.senderID;
    }
    // Mention check
    else if (Object.keys(event.mentions).length > 0) {
      uid2 = Object.keys(event.mentions)[0];
    }
    // Random mode
    else if (/^(random|rnd|r)$/i.test(content)) {
      await message.reply("👊 𝐀𝐜𝐭𝐢𝐯𝐚𝐭𝐢𝐧𝐠 𝐑𝐚𝐧𝐝𝐨𝐦 𝐒𝐥𝐚𝐩 𝐌𝐨𝐝𝐞...");

      const botApi = api || global.api || message.api;
      if (!botApi) return message.reply("⚠️ API not found — random mode unavailable!");

      const info = await botApi.getThreadInfo(event.threadID);
      const members = info.participantIDs.filter(id => id !== uid1);

      if (!members.length) return message.reply("No users available to slap!");

      uid2 = members[Math.floor(Math.random() * members.length)];
    }

    if (!uid2) return message.reply("You must tag, reply, or use random to choose someone 😼");

    // Generate image
    const avatarURL1 = await usersData.getAvatarUrl(uid1);
    const avatarURL2 = await usersData.getAvatarUrl(uid2);
    const img = await new DIG.Batslap().getImage(avatarURL1, avatarURL2);
    const pathSave = `${__dirname}/tmp/${uid1}_${uid2}_Batslap.png`;
    fs.writeFileSync(pathSave, Buffer.from(img));

    // Send message
    message.reply({
      body: `🎬 ${(content.match(/random|rnd|r/i) ? "" : content) || "Boom! 😵"}`,
      attachment: fs.createReadStream(pathSave)
    }, () => fs.unlinkSync(pathSave));
  }
};
