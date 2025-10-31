const mongoose = require("mongoose");

const vipUserSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  addedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true }
});
const vipModel = mongoose.models.vipUsers || mongoose.model("vipUsers", vipUserSchema);

module.exports = {
  config: {
    name: "vip",
    version: "3.1",
    author: "Copilot",
    role: 0, // Anyone can run the base command, permission checked inside
    category: "config",
    guide: {
      en: "/vip add <uid> or @mention\n/vip rm <uid> or @mention\n/vip list"
    }
  },

  onStart: async function({ api, event, args, message, usersData }) {
    const senderID = event.senderID;
    const subcommand = (args[0] || "").toLowerCase();

    // Helper: Check if sender is bot admin
    let role = 0;
    try {
      const adminBot = global.GoatBot?.config?.adminBot || [];
      if (adminBot.includes(senderID)) role = 2;
    } catch (e) {}

    // --- Helper to extract UID from arg or @mention ---
    function getUidFromArgOrMention(arg, mentionsObj) {
      // If @mention
      if (Object.keys(mentionsObj || {}).length > 0) {
        return Object.keys(mentionsObj)[0];
      }
      // If argument is a number string
      if (/^\d+$/.test(arg)) return arg;
      return null;
    }

    // --- ADD VIP ---
    if (subcommand === "add") {
      if (role < 2)
        return message.reply("❌ Only bot admin can add VIP users!");

      // Try getting UID from @mention or direct UID
      const uid = getUidFromArgOrMention(args[1], event.mentions);
      if (!uid) return message.reply("Please provide a UID or @mention to add as VIP.");

      const now = new Date();
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      await vipModel.findOneAndUpdate(
        { uid },
        { uid, addedAt: now, expiresAt },
        { upsert: true, new: true }
      );

      // Name for confirmation
      let name = uid;
      try {
        const user = await usersData.get(uid);
        if (user && user.name) name = user.name;
      } catch (e) {}

      return message.reply(
        `✅ ${name} (${uid}) has been added as VIP.\nAdded at: ${now.toLocaleString()}\nValid till: ${expiresAt.toLocaleString()}`
      );
    }

    // --- REMOVE VIP ---
    if (subcommand === "rm" || subcommand === "remove") {
      if (role < 2)
        return message.reply("❌ Only bot admin can remove VIP users!");

      const uid = getUidFromArgOrMention(args[1], event.mentions);
      if (!uid) return message.reply("Please provide a UID or @mention to remove from VIP.");
      await vipModel.deleteOne({ uid });

      // Name for confirmation
      let name = uid;
      try {
        const user = await usersData.get(uid);
        if (user && user.name) name = user.name;
      } catch (e) {}

      return message.reply(`❌ ${name} (${uid}) has been removed from VIP list.`);
    }

    // --- LIST VIPs (Everyone can use this) ---
    if (subcommand === "list") {
      const vips = await vipModel.find({});
      if (!vips.length) return message.reply("No VIPs found!");

      // Sort by addedAt (optional)
      vips.sort((a, b) => a.addedAt - b.addedAt);

      let msg = "👑 VIP List:\n";
      let index = 1;
      const now = new Date();

      for (const vip of vips) {
        // Name fetch from usersData
        let name = vip.uid;
        try {
          const user = await usersData.get(vip.uid);
          if (user && user.name) name = user.name;
        } catch (e) {}

        // Dates and validity
        const addedAtStr = vip.addedAt.toLocaleDateString();
        const expireStr = vip.expiresAt.toLocaleDateString();
        const validityMs = vip.expiresAt - now;
        const validityDays = Math.max(0, Math.ceil(validityMs / (1000 * 60 * 60 * 24)));
        const validMsg = validityMs > 0 ? `${validityDays} days left` : "Expired";

        msg += `${index}. ${name} (${vip.uid})\n   ➤ Added: ${addedAtStr}\n   ➤ Expires: ${expireStr}\n   ➤ Validity: ${validMsg}\n`;
        index++;
      }
      return message.reply(msg);
    }

    // --- HELP ---
    return message.reply("Usage:\n/vip add <uid> or @mention\n/vip rm <uid> or @mention\n/vip list");
  }
};
