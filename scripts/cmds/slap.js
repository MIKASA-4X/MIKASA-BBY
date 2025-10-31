const DIG = require("discord-image-generation");
const fs = require("fs-extra");

module.exports = {
  config: {
    name: "slap",
    version: "2.2",
    author: "Saif",
    countDown: 5,
    role: 4,
    shortDescription: "Batslap image",
    longDescription: "Create Batslap meme with tagged, replied or random user",
    category: "image",
    guide: {
      en: "{pn} @tag\n{pn} random | rnd | rndm\nOr reply to a user's message"
    }
  },

  langs: {
    en: {
      noTarget: "You must tag, reply, or use random to choose someone 😼",
      activating: "👊 𝐀𝐜𝐭𝐢𝐯𝐚𝐭𝐢𝐧𝐠 𝐑𝐚𝐧𝐝𝐨𝐦 𝐒𝐥𝐚𝐩 𝐌𝐨𝐝𝐞...",
      done: "boom  😵‍💫😵"
    }
  },

  onStart: async function ({ event, message, usersData, args, getLang, api }) {
    const uid1 = event.senderID;
    let uid2 = null;
    const content = args.join(" ");

    // reply user check
    if (event.messageReply?.senderID) {
      uid2 = event.messageReply.senderID;
    }
    // mention check
    else if (Object.keys(event.mentions).length > 0) {
      uid2 = Object.keys(event.mentions)[0];
    }
    // random mode
    else if (/^(random|rnd|rndm)$/i.test(content)) {
      await message.reply(getLang("activating"));

      const botApi = api || global.api || message.api;
      if (!botApi)
        return message.reply("⚠️ API not found — random mode unavailable!");

      const info = await botApi.getThreadInfo(event.threadID);
      const members = info.participantIDs.filter(id => id !== uid1);

      if (!members.length)
        return message.reply("No users available to slap!");

      uid2 = members[Math.floor(Math.random() * members.length)];
    }

    if (!uid2)
      return message.reply(getLang("noTarget"));

    // generate image
    const avatarURL1 = await usersData.getAvatarUrl(uid1);
    const avatarURL2 = await usersData.getAvatarUrl(uid2);
    const img = await new DIG.Batslap().getImage(avatarURL1, avatarURL2);
    const pathSave = `${__dirname}/tmp/${uid1}_${uid2}_Batslap.png`;
    fs.writeFileSync(pathSave, Buffer.from(img));

    // send message
    message.reply({
      body: `🎬 ${(content.match(/random|rnd|r/i) ? "" : content) || getLang("done")}`,
      attachment: fs.createReadStream(pathSave)
    }, () => fs.unlinkSync(pathSave));
  }
};
