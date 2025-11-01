import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import creds from "./credentials.json" with { type: "json" };
import express from "express";

// ================================
// EXPRESS KEEP-ALIVE
// ================================
const app = express();
app.get("/", (req, res) => res.send("💚 GachaBot is alive!"));
app.listen(3000, () => console.log("🌐 Web server ready"));

// ================================
// CONFIG
// ================================
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const OWNER_ID = process.env.OWNER_ID;
const ADMIN_CHANNEL_ID = process.env.ADMIN_CHANNEL_ID;
const GACHA_LIMIT = 5;
const gachaCountPerGuild = new Map();
const userGuildMap = new Map();

function norm(v) {
  return String(v ?? "").trim();
}

// ================================
// GOOGLE SHEETS CONNECT
// ================================
const auth = new JWT({
  email: creds.client_email,
  key: creds.private_key.replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const doc = new GoogleSpreadsheet(SHEET_ID, auth);
await doc.loadInfo();
const sheet = doc.sheetsByIndex[0];

// โหลดแท็บ ServerCount
let sheetServer = doc.sheetsByTitle["ServerCount"];
if (!sheetServer) {
  sheetServer = await doc.addSheet({
    title: "ServerCount",
    headerValues: ["GuildID", "GachaCount"],
  });
}
await sheetServer.loadHeaderRow();
const serverRows = await sheetServer.getRows();
for (const r of serverRows) {
  const gid = norm(r.GuildID);
  const count = parseInt(r.GachaCount || 0);
  if (gid) gachaCountPerGuild.set(gid, count);
}

// ================================
// REWARD SYSTEM
// ================================
const rewards = [
  { name: "หัวอกเส้นรัฟ ✏️", rate: 50 },
  { name: "ครึ่งตัวเส้นรัฟ 🖋️", rate: 40 },
  { name: "เต็มตัวเส้นรัฟ 🖊️", rate: 10 },
  { name: "หัวอกสีเรียบ 🎨", rate: 5 },
  { name: "เต็มตัวสีเรียบ 🖼️", rate: 2 },
  { name: "เกลือนะจ๊ะ อิอิ 🧂", rate: 10 },
];

function randomReward() {
  const rand = Math.random() * 100;
  let acc = 0;
  for (const r of rewards) {
    acc += r.rate;
    if (rand <= acc) return r.name;
  }
  return rewards[rewards.length - 1].name;
}

// ================================
// DISCORD BOT INIT
// ================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

client.once("ready", () => console.log(`✅ Logged in as ${client.user.tag}`));

// ================================
// MENU CREATION
// ================================
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  const cmd = msg.content.toLowerCase();

  if (cmd === "!menu" && msg.author.id === OWNER_ID) {
    const embed = new EmbedBuilder()
      .setTitle("💖 กาชาสุ่มงาน ART 💖")
      .setDescription(
        "ครั้งละ **1 เหรียญ (50฿)**\n\n🎨 ของรางวัล:\n- หัวอกเส้นรัฟ (50%)\n- ครึ่งตัวเส้นรัฟ (40%)\n- เต็มตัวเส้นรัฟ (10%)\n- เกลือ (10%)\n- หัวอกสีเรียบ (5%)\n- เต็มตัวสีเรียบ (2%)"
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("gacha")
        .setLabel("🎰 หมุนกาชา")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("balance")
        .setLabel("💎 เช็คยอดเงิน")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("slip")
        .setLabel("🪙 เติมเหรียญ")
        .setStyle(ButtonStyle.Success)
    );

    await msg.channel.send({ embeds: [embed], components: [row] });
    msg.reply("✨ เมนูถูกสร้างแล้วจ้า~");
  }
});

// ================================
// BUTTON HANDLER
// ================================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const guildId = norm(interaction.guild?.id || "DM");

  // 🎰 กาชา
  if (interaction.customId === "gacha") {
    await interaction.deferReply();

    const rows = await sheet.getRows();
    const userRows = rows.filter(
      (r) => norm(r.User) === norm(interaction.user.id) && norm(r.GuildID) === guildId
    );

    if (userRows.length === 0) {
      await interaction.editReply("❌ ยังไม่มีข้อมูลของคุณในระบบ ลองเติมก่อนนะ 💚");
      return;
    }

    const coins = userRows.reduce((sum, r) => sum + (parseInt(r.Coins || 0) || 0), 0);
    if (coins < 1) {
      await interaction.editReply("❌ คอยน์ไม่พอจ้า เติมก่อนน้า 💰");
      return;
    }

    const count = gachaCountPerGuild.get(guildId) || 0;
    if (count >= GACHA_LIMIT) {
      await interaction.editReply("🔒 ครบโควต้าแล้ว! รอรีเซ็ตก่อนจ้า 💚");
      return;
    }

    let need = 1;
    for (const r of userRows) {
      if (need <= 0) break;
      const available = parseInt(r.Coins || 0);
      if (available > 0) {
        const deduct = Math.min(available, need);
        r.Coins = available - deduct;
        await r.save();
        need -= deduct;
      }
    }

    const reward = randomReward();
    const newCount = count + 1;
    gachaCountPerGuild.set(guildId, newCount);

    const serverRows = await sheetServer.getRows();
    const found = serverRows.find((r) => norm(r.GuildID) === guildId);
    if (found) {
      found.GachaCount = newCount;
      await found.save();
    } else {
      await sheetServer.addRow({ GuildID: guildId, GachaCount: newCount });
    }

    await interaction.editReply(
      `🎁 ${interaction.user} ได้รับรางวัล: **${reward}**\n💰 คอยน์คงเหลือ: ${coins - 1}`
    );
  }

  // 💎 เช็คยอด
  if (interaction.customId === "balance") {
    await interaction.deferReply({ ephemeral: true });
    const rows = await sheet.getRows();
    const mine = rows.filter(
      (r) => norm(r.User) === norm(interaction.user.id) && norm(r.GuildID) === guildId
    );
    const total = mine.reduce((sum, r) => sum + (parseInt(r.Coins || 0) || 0), 0);
    await interaction.editReply(`💰 คุณมีทั้งหมด **${total} coins** ในเซิร์ฟนี้ 💎`);
  }

  // 💵 เติมเงิน
  if (interaction.customId === "slip") {
    try {
      userGuildMap.set(interaction.user.id, {
        guildId,
        guildName: interaction.guild?.name || "Unknown",
        channelId: interaction.channel.id,
      });
      const dm = await interaction.user.createDM();
      await dm.send("💵 ส่งสลิปพร้อมพิมพ์ `!slip 100` เพื่อแจ้งยอดนะ 💚");
      await interaction.reply({ content: "📩 ทักไปใน DM แล้วจ้า~", ephemeral: true });
    } catch {
      await interaction.reply({
        content: "❌ เปิดรับ DM ก่อนน้า (Settings → Privacy → Allow DMs)",
        ephemeral: true,
      });
    }
  }
});

// ================================
// DM SLIP
// ================================
client.on("messageCreate", async (msg) => {
  if (msg.author.bot || msg.channel.type !== 1) return;
  if (!msg.content.startsWith("!slip")) return;

  const args = msg.content.split(" ");
  const amount = parseFloat(args[1]);
  const slip = msg.attachments.first();

  if (!amount || !slip)
    return msg.reply("❌ โปรดพิมพ์ยอดเงินและแนบรูป เช่น `!slip 100` 💵");

  const info = userGuildMap.get(msg.author.id);
  if (!info)
    return msg.reply("❌ โปรดกดปุ่ม 💵 เติมเงิน ในเซิร์ฟเวอร์ก่อนส่งสลิปนะ 💚");

  const { guildId, guildName, channelId } = info;
  await sheet.addRow({
    User: msg.author.id,
    Username: msg.author.username,
    GuildID: guildId,
    GuildName: guildName,
    Coins: 0,
    LastSlip: slip.url,
    Status: "รออนุมัติ",
    Date: new Date().toLocaleString(),
  });

  msg.reply(`📤 รับสลิปของ **${guildName}** แล้ว 💚 รอแอดมินตรวจนะคะ`);
});

// ================================
// LOGIN
// ================================
client.login(process.env.DISCORD_TOKEN);

