/*
@header({
  title: '聚合短剧',
  lang: 'dr3',
  searchable: 2,
  filterable: 1,
  quickSearch: 0,
})
*/
// ============================================================================
// 聚合短剧 dr3 版 —— 由 聚合短剧.py (FongMi py Spider) 转换
// 聚合 14 个短剧平台：河马/七猫/星芽/百度/山海/薏米/牛牛/围观/西饭/好看/喜福/星星/爽爽/五五
// 说明：
//  - vod_id 沿用 py 版格式 "平台@id"（星星/喜福多段用 @ 分隔，西饭用 # 分隔）
//  - 喜福 detail 修复了 py 版 aid/total 解析互换的 bug
//  - 山海 AES-GCM 解密用 ECB+CTR 手写实现（仅解 payload，不校验 tag；12B nonce 直算，其他长度走 GHASH）
//  - 薏米 RSA-SHA256 签名优先 WebCrypto(pkcS8)，失败回退 JSEncrypt.sign
// ============================================================================

// ---------------------------- 常量 ----------------------------
const KEYS = 'd3dGiJc651gSQ8w1';
const DEF_UA = 'okhttp/4.10.0';
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 10; SM-G970F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Mobile Safari/537.36';
const WEB_UA = 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36';

// 河马 AES-CBC key/iv（py 中 base64 解码后的明文）
const HEMA_KEY = 'dzkjgfyxgshylgzm';
const HEMA_IV = 'apiupdownedcrypt';
// 山海 AES-GCM key
const SH_KEY = 'xxxxxxwhwqedqder';

const CHAR_MAP = {
  '+': 'P', '/': 'X', '0': 'M', '1': 'U', '2': 'l', '3': 'E', '4': 'r', '5': 'Y', '6': 'W', '7': 'b', '8': 'd', '9': 'J',
  A: '9', B: 's', C: 'a', D: 'I', E: '0', F: 'o', G: 'y', H: '_', I: 'H', J: 'G', K: 'i', L: 't',
  M: 'g', N: 'N', O: 'A', P: '8', Q: 'F', R: 'k', S: '3', T: 'h', U: 'f', V: 'R', W: 'q', X: 'C',
  Y: '4', Z: 'p', a: 'm', b: 'B', c: 'O', d: 'u', e: 'c', f: '6', g: 'K', h: 'x', i: '5', j: 'T',
  k: '-', l: '2', m: 'z', n: 'S', o: 'Z', p: '1', q: 'V', r: 'v', s: 'j', t: 'Q', u: '7', v: 'D',
  w: 'w', x: 'n', y: 'L', z: 'e',
};

const HEADERS = {
  default: { 'User-Agent': DEF_UA, 'Content-Type': 'application/json' },
  niuniu: { 'Cache-Control': 'no-cache', 'Content-Type': 'application/json;charset=UTF-8', 'User-Agent': 'okhttp/4.12.0' },
  baidu: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 9; 22081212C Build/PQ3B.190801.002) Talos/1.8.13 SP-engine/3.47.0 bd_dvt/1 baiduboxapp/15.21.0.10 (Baidu; P1 9)' },
  haokan: {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 11; M2012K10C Build/RP1A.200720.011; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/87.0.4280.141 Mobile Safari/537.36 haokan/7.80.0.18 (Baidu; P1 11)/imoaiX_03_11_C01K2102M/1043677m/5ACDB023CFB9D64743B08E51953F7C76%7CVSAJ32AVA/1/7.80.0.18/780001/1/immersiveMode/modeV4PlusWhite/isFirstInstall/bbqMode/bbqModeV2/blackStyle/isPlaylet Talos/1.8.7',
    'Talos-Module-Name': 'shortDrama', 'Talos-Module-Version': '1.0.71.1',
    'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
    Cookie: 'BAIDUCUID=giHCu0azv80G8SfQ0avU8gaaH8jfiv86ju2MugiR2i8-k3a35avAa1_mA',
  },
  hema: {
    alg: 'HG45LKBS',
    datas: 'phM9hgPlRJYhe1CnGhmAXAGxykuiUzMzDg9O6gim3BYyV82hDVoeHMMzRimC6OhW7BLsDRmEnSa5Tv/yZHZ2+Q3hypMQTA6hentuuRFdFSRnRqGF0aeskqdImcXPXZOKfNWw8w2syoAxXUCYd+8H5fX+hF34F5UQidB8DN8KHWmNn79AAEb2xTXFsB4mcn5YYDGm1iIDRaosixoS5pFySNGOLtkMgjIbRSrN1cxPq/BNE/7isNe/25z+svVABRWfFFM1ehaWgLSnsAn96c8Ptc3TwLjx7kDCWnNx2MP9f04T6qA8mP/SworDn4Hhoo0Tsrjmg5enoPwLs3V1HHazSMPxC+pIC6bW3GrQ0Ar0uhIVXXmX+zYQGcyI4bXphY9iFObo81h6d9LIxR47RbNHfGZ2NJUHJmF5lFHXCInleDrNjw+gf91VG6EjPaBNmN60ka7/nVpYmGK3GC8cw6iEi52jCn+AgRbeygGPH2CdMLcunIOgEIT+aL4YnVxP13peX//bi1+gfeItPB0rsL5YPh3XWas/73dLYTtTYZVVYQspAnYwj2BTvlCfnjGcKNgPa7YfB21xLLuCCAnrrmy7zgkKmyTr2zGVPgaCv5IhiNtrbw8XQMODjgEhijC+arxig3wPaXkHbSkHFwlpO4UaWgLxz8gUYxKDSFXa+5Z8988z7EcDtsOepH1EwyV277SV+McDi/4QDNhC4UV8hA0bDQ==',
    'x-request-id': '267871ed-5d33-469d-b349-d0a4df6730cc', 'content-type': 'application/json; charset=utf-8', 'accept-encoding': 'gzip', 'user-agent': 'okhttp/4.10.0',
  },
  xingxing: { 'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.87 Safari/537.36' },
  web: { 'User-Agent': WEB_UA },
};

const RULES = {
  河马: { host: 'https://freevideo.zqqds.cn', list: '/free-video-portal/portal/1125', detail: '/free-video-portal/portal/1131', play: '/free-video-portal/portal/1139', search: '/free-video-portal/portal/1803' },
  七猫: { host: 'https://api-store.qmplaylet.com', list: '/api/v1/playlet/index', detail: 'https://api-read.qmplaylet.com/player/api/v1/playlet/info', search: '/api/v1/playlet/search' },
  百度: { host: 'https://mbd.baidu.com', detailHost: 'https://sv.baidu.com', list: '/feedapi/v1/videoserver/playlets/list?service=bdbox', search: '/feedapi/v1/videoserver/playlets/search?service=bdbox', detail: '/haokan/ui-video/playlet/rec/detail?log=vhk&tn=1020970b&ctn=1008350n&blur=1', play: '/appui/api?cmd=video/relate&log=vhk&tn=1020970b&ctn=1008350n&blur=1' },
  牛牛: { host: 'https://new.tianjinzhitongdaohe.com', list: '/api/v1/app/screen/screenMovie', detail: '/api/v1/app/play/movieDetails', search: '/api/v1/app/search/searchMovie', desc: '/api/v1/app/play/movieDesc', visitor: '/api/v1/app/user/visitorInfo', login: 'https://csj-sp.csjdeveloper.com/csj_sp/api/v1/user/login?siteid=5627189', detail2: 'https://csj-sp.csjdeveloper.com/csj_sp/api/v1/shortplay/detail?siteid=5627189', unlock: 'https://csj-sp.csjdeveloper.com/csj_sp/api/v1/pay/ad_unlock?siteid=5627189' },
  围观: { host: 'https://api.drama.9ddm.com', list: '/drama/home/shortVideoTags?version_code=1500&os_type=1', detail: '/drama/home/shortVideoDetail?version_code=1000&os_type=1', search: '/drama/home/search?version_code=1500&os_type=1' },
  西饭: { host: 'https://xifan-api-cn.youlishipin.com', list: '/xifan/drama/portalPage', detail: '/xifan/drama/getDuanjuInfo', search: '/xifan/search/getSearchList' },
  星星: { host: 'http://read.api.duodutek.com', list: '/novel-api/app/pageModel/getResourceById', detail: '/novel-api/basedata/book/getChapterList' },
  好看: { host: 'https://sv.baidu.com', list: '/haokan/ui-feed/playletTagsFeed?osbranch=a0', home: '/haokan/ui-feed/playletShelfFeed?osbranch=a0', detail_list: '/appui/api?osbranch=a0', detail: '/haokan/ui-video/playlet/rec/detail?osbranch=a0', play: '/appui/api?osbranch=a0', search: '/haokan/ui-interact/playlet/search/sugs?osbranch=a0' },
  星芽: { host: 'https://app.whjzjx.cn', list: '/cloud/v2/theater/home_page?theater_class_id', detail: '/v2/theater_parent/detail', search: '/v3/search', login: 'https://u.shytkjgs.com/user/v1/account/login' },
  山海: { host: 'https://api.app.gxshxy.com', login: 'https://u.app.gxshxy.com/user/v3/account/login', list: '/shanhai-theater/v2/theater_parent/cloud/v2/theater/home_page', detail: '/v2/theater_parent/detail', search: '/cloud/v3/search' },
  薏米: { host: 'https://yimi-api.zhangyue.com', list: '/bookstore/local/visual/channel/list', detail: '/video/client/short_play/episode_list', search: '/bookstore/search/recommend_data' },
  爽爽: { host: 'https://djw123.com', searchUrl: '/search/-------------.html' },
  喜福: { host: 'https://minidrama-api.contentchina.com', list: '/web/v1/home/categoryList?isLeft=1', dramaList: '/web/v1/drama/list', playAuth: '/web/v1/drama/play_auth' },
  五五: { host: 'https://www.duanju55.com', search: '/index.php/vod/search/wd/', detail: '/index.php/vod/detail/id/' },
};

const PLATFORMS = [
  { name: '河马短剧', id: '河马' }, { name: '七猫短剧', id: '七猫' }, { name: '星芽短剧', id: '星芽' },
  { name: '百度短剧', id: '百度' }, { name: '山海短剧', id: '山海' }, { name: '薏米短剧', id: '薏米' },
  { name: '牛牛短剧', id: '牛牛' }, { name: '围观短剧', id: '围观' }, { name: '西饭短剧', id: '西饭' },
  { name: '好看短剧', id: '好看' }, { name: '喜福短剧', id: '喜福' }, { name: '星星短剧', id: '星星' },
  { name: '爽爽短剧', id: '爽爽' }, { name: '五五短剧', id: '五五' },
];

const DEFAULT_AREA = {
  河马: '10@强爽男频', 七猫: '0', 百度: '新剧', 牛牛: '现言',
  围观: '', 西饭: '68@都市', 星星: '1287', 好看: '1',
  星芽: '1', 山海: '1', 薏米: 'channel_c6f50cd9',
  爽爽: '', 喜福: '', 五五: '全部',
};

// 薏米 RSA 私钥（PKCS8 PEM，用于 x-sig-sign 请求头签名）
const YIMI_PEM = [
  '-----BEGIN PRIVATE KEY-----',
  'MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDwCPsMptVn80Im4VVfJ2uAkjs7NpJzzsyGxleK1uN9ux/KTiY2o8kiXcRIcAYVChfdX4ywUs0jrjh8iTcC91r6qgeBaDS8wWsL5bZrn7O/8sqq2hbizV4AvvsqhxVJzRUJZjbNOcMZOPJoeL5K4U4YsiOyV8a9lt5C6zEC4Qy0xjscvOTGyVTqtWeJedEedXtiKLQxAiy6OKJxyHQqdwMHUfAgAbLzAHcVpg1RSXwud+5vtTJNXOXT98FHoFDcRIEcHiiqfU9dskzAhG2nPbFujO+YFq9tZBrWmrhPaXcHfXZqtEYePM4vuvMYjhmANdG4Ehl6pN9nuEaLZ+L35/3nAgMBAAECggEBAOe+M+s2E2ll8WMqQEs6+s5J4Ee9201Vxh8E1TYlW8Ni60FdjAVKwgCc+Mla5nRfp0TCYElH1+hv5vdNXsBNYhgKGm701Z27O4dkA2gK6vcSCFtFbb0Qu4YK3OFlQ8dZ6cqGVbhz4Qmz8k2s7UPMHKM5Mb+YgTc/tlxzR4FZF/RaY8MDpv6iMcXPY27xJzZAV1jROCXjZTZNYbgjsKDAbthRDkjMyuKCIdq7rAHrEyFSx3n7/uxnZYh42bXzWyyWudbkAJoq1ZYx+NyYj5TsN/WNoYbCPcX0Ko+CNnpkC/6qtQbHrBiMprnld67qdLCVhWpmOBYukXVPwFMJjOFlYKkCgYEA+WDh3LpitYSO6hn7mhnbqEQba13cutbJW9RQa0BjGf1OGXdqXpimcWK7viZYAKhLlyGWQmoWduDq4bjSRx7ZxY8pMtpIUWoVkKItD7D2yvmYN1guHNRpHlUIAsSH3HGwQIeXy36hJcB5gC+3XgRVPz/juTMWJDC0usECNFz17bsCgYEA9miWi6JPnZ1ffQzAyE+P6vGC/Vrl7Uyr9gqxI/OkZa8bUqfZtGo5UDGSaGRUsoTsYiEJ8m5blPY0X4xr5x1kO6rfk0gHxn1OXlCP42yT2+CqQvjNO2DHOnWNryKjmAqaAITbmC2lgj0PiiPO32ZT3aXTOgwxTKbFP3LBDmwA18UCgYAQuEgsbmqz1OFoHLnbySQLEhXsiuyDsmbpu0BxEG4UjgEwf+sn0IBIVeBUjWmVEbOPvHbAmTBMZCQbYjLnBdCACGswt6Xln4E2o0j2Jl1Fmpp0C3t7/1nU6MqStO6O/yhcCztIL4NKbq82wvw+V3gHt5bjEePIJWPYqZwmOp1ahQKBgCqfHKs6gBr7RbETq6T6XiJ9c/Lu7iaFxJjicJGPazhLeaZqcjXKye8dI/36nMvkQh8XJ+lPPXgeviBo4aEwbE4F2HZZVz72HcAin0DvXwQBcHH1J0rGCrAJ9V/91d5OtySv1mwUOTS16yIx3260/HyyWj8ILN7dWfEHoG0mMV8hAoGBAI0KBzR9WfzxNKI4ZqRD9/sN+SH4oxymo2oJ+FnOW7hk1E0EyrsGzIDCrS/f7MPzLJI7F4DULsrU5RIQyouIybZra29Vqe4L8kdIae5O0R4Y2r7gt/yWo4cWnW53Q0f5o7mzV10Dc8ewuT1DyJrt25dMWsGsP8rQ/0pVUBLEf93b',
  '-----END PRIVATE KEY-----',
].join('\n');

// 筛选项构造
function fv(key, name, vals) {
  return { key, name, value: vals.map((x) => ({ n: x[0], v: x[1] })) };
}

const FILTERS = {
  河马: [fv('area', '分类', [['强爽男频', '10@强爽男频'], ['女频虐恋', '11@女频虐恋'], ['古装大剧', '12@古装大剧'], ['豪门总裁', '13@豪门总裁'], ['重生逆袭', '14@重生逆袭']])],
  七猫: [fv('area', '分类', [['全部', ''], ['推荐', '0'], ['新剧', '-1'], ['都市情感', '1273'], ['古装', '1272'], ['都市', '571'], ['玄幻仙侠', '1286'], ['奇幻', '570'], ['乡村', '590'], ['民国', '573'], ['年代', '572'], ['青春校园', '1288'], ['武侠', '371'], ['科幻', '594'], ['末世', '556'], ['二次元', '1289'], ['逆袭', '400'], ['穿越', '373'], ['复仇', '795'], ['系统', '787'], ['权谋', '790'], ['重生', '784'], ['女性成长', '1294'], ['打脸虐渣', '716'], ['闪婚', '480'], ['强者回归', '402'], ['追妻火葬场', '715'], ['家庭', '670'], ['马甲', '558'], ['职场', '724'], ['宫斗', '343'], ['高手下山', '1299'], ['娱乐明星', '1295'], ['异能', '727'], ['宅斗', '342'], ['替身', '712'], ['穿书', '338'], ['商战', '723'], ['种田经商', '1291'], ['伦理', '1293'], ['社会话题', '1290'], ['致富', '492'], ['偷听心声', '1258'], ['脑洞', '526'], ['豪门总裁', '624'], ['萌宝', '356'], ['战神', '527'], ['真假千金', '812'], ['赘婿', '36'], ['神医', '1269'], ['神豪', '37'], ['小人物', '1296'], ['团宠', '545'], ['欢喜冤家', '464'], ['女帝', '617'], ['银发', '1297'], ['兵王', '28'], ['虐恋', '16'], ['甜宠', '21'], ['悬疑', '27'], ['搞笑', '793'], ['灵异', '1287']])],
  百度: [fv('area', '分类', [['新剧', '新剧'], ['限时免费', '限时免费'], ['精选', '精选'], ['独播', '独播'], ['全部', '全部题材'], ['神医', '神医'], ['连续剧', '连续剧'], ['都市', '都市'], ['现代言情', '现代言情'], ['异能', '异能'], ['逆袭', '逆袭'], ['甜宠', '甜宠'], ['总裁', '总裁'], ['萌宝', '萌宝'], ['战神', '战神'], ['宫斗宅斗', '宫斗宅斗'], ['神豪', '神豪'], ['虐恋', '虐恋'], ['闪婚', '闪婚'], ['玄幻', '玄幻'], ['穿越重生', '穿越重生'], ['年代', '年代'], ['家庭伦理', '家庭伦理'], ['古代言情', '古代言情'], ['武侠武打', '武侠武打'], ['赘婿', '赘婿'], ['单元剧', '单元剧'], ['青春校园', '青春校园'], ['历史架空', '历史架空'], ['王妃', '王妃'], ['鉴宝', '鉴宝'], ['科幻', '科幻'], ['军旅战争', '军旅战争'], ['种田', '种田']])],
  牛牛: [fv('area', '分类', [['全部', ''], ['现言', '现言'], ['古言', '古言'], ['历史', '历史'], ['都市', '都市'], ['活动', '活动'], ['逆袭', '逆袭'], ['豪门', '豪门'], ['现代言情', '现代言情'], ['战神', '战神'], ['甜宠', '甜宠'], ['穿越', '穿越'], ['古装', '古装'], ['虐心', '虐心'], ['神医', '神医'], ['赘婿', '赘婿'], ['亲情', '亲情'], ['复仇', '复仇'], ['玄幻', '玄幻'], ['古代言情', '古代言情'], ['热血', '热血'], ['动作', '动作'], ['喜剧', '喜剧'], ['悬疑', '悬疑'], ['军事', '军事'], ['二次元', '二次元'], ['未来', '未来'], ['快速穿越', '快速穿越'], ['烧脑', '烧脑'], ['治愈', '治愈'], ['其他剧情', '其他剧情']])],
  围观: [fv('area', '分类', [['全部', '']])],
  西饭: [fv('area', '分类', [['都市', '68@都市'], ['青春', '68@青春'], ['现代言情', '81@现代言情'], ['豪门', '81@豪门'], ['大女主', '80@大女主'], ['逆袭', '79@逆袭'], ['打脸虐渣', '79@打脸虐渣'], ['穿越', '81@穿越']])],
  星星: [fv('area', '分类', [['甜宠', '1287'], ['逆袭', '1288'], ['热血', '1289'], ['现代', '1290'], ['古代', '1291']])],
  好看: [fv('area', '分类', [['热播剧', '1'], ['新剧', '2'], ['战神', '1001'], ['神豪', '2001'], ['神医', '1002'], ['甜宠', '1007'], ['赘婿', '1003'], ['穿越重生', '2004'], ['异能', '2005'], ['虐恋', '1006'], ['宫斗宅斗', '2006'], ['玄幻', '2009']])],
  星芽: [fv('area', '分类', [['剧场', '1'], ['热播剧', '2'], ['会员专享', '8'], ['星选好剧', '7'], ['新剧', '3'], ['阳光剧场', '5']])],
  山海: [fv('area', '分类', [['剧场', '1'], ['热播剧', '2'], ['会员专享', '8'], ['星选好剧', '7'], ['新剧', '3'], ['阳光剧场', '5']])],
  薏米: [fv('area', '分类', [['精选', 'channel_c6f50cd9'], ['逆袭', 'channel_a8e10abc'], ['复仇', 'channel_d26dd434'], ['恋爱', 'channel_75afe84a'], ['重生', 'channel_2272aac5'], ['古风', 'channel_73190d4f'], ['神医', 'channel_2d7eae6b'], ['言情', 'channel_614820bd'], ['都市', 'channel_13dfce8b'], ['悬疑', 'channel_861b9642'], ['历史', 'channel_18157927']])],
  爽爽: [fv('area', '分类', [['全部', ''], ['女频恋爱', '女频恋爱'], ['脑洞悬疑', '脑洞悬疑'], ['年代穿越', '年代穿越'], ['古装仙侠', '古装仙侠'], ['现代都市', '现代都市'], ['反转', '反转'], ['爽文', '爽文'], ['短剧', '短剧']])],
  五五: [fv('area', '分类', [['全部', '全部'], ['男频', '男频'], ['女频', '女频'], ['都市', '都市'], ['虐渣', '虐渣'], ['励志', '励志'], ['逆袭', '逆袭'], ['古风', '古风'], ['复仇', '复仇'], ['家庭', '家庭'], ['悬疑', '悬疑'], ['奇幻', '奇幻']])],
};

// ---------------------------- 基础工具 ----------------------------
function safeJson(s, d) {
  if (typeof s === 'object' && s !== null) return s;
  try {
    const o = JSON.parse(s || '{}');
    return o === null || o === undefined ? (d === undefined ? {} : d) : o;
  } catch (e) {
    return d === undefined ? {} : d;
  }
}

function dedup(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const vid = x.vod_id;
    if (vid && !seen.has(vid)) {
      seen.add(vid);
      out.push(x);
    }
  }
  return out;
}

// 请求头合并（大小写不敏感覆盖，避免 fetch 出现重复头）
function mergeHeaders(base, extra) {
  const out = {};
  for (const k of Object.keys(base || {})) out[k.toLowerCase()] = base[k];
  for (const k of Object.keys(extra || {})) out[k.toLowerCase()] = extra[k];
  return out;
}

// 网络请求：返回响应文本（对齐 py 版 self.req 语义：默认合并 default 头，异常返回 ''）
async function http(ctx, url, opts) {
  try {
    const o = opts || {};
    o.headers = mergeHeaders(HEADERS.default, o.headers);
    const r = await ctx.req(url, o);
    return r ? (r.content || '') : '';
  } catch (e) {
    log('【请求异常】' + url + ' - ' + (e && e.message ? e.message : e));
    return '';
  }
}

function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, '');
}

function hmac256Hex(data, key) {
  return CryptoJS.HmacSHA256(data, key).toString(CryptoJS.enc.Hex);
}

function uuidV4() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch (e) { /* ignore */ }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function rfc3986(s) {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

// ---------------------------- 加解密 ----------------------------
// AES-ECB（牛牛 / 山海登录），py: aesEncryptECB / aesDecryptECB
function aesEncECB(plain, key) {
  try {
    return CryptoJS.AES.encrypt(CryptoJS.enc.Utf8.parse(plain), CryptoJS.enc.Utf8.parse(key), { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }).toString();
  } catch (e) { return ''; }
}

function aesDecECB(cipherB64, key) {
  try {
    const d = CryptoJS.AES.decrypt(cipherB64, CryptoJS.enc.Utf8.parse(key), { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 });
    return d.toString(CryptoJS.enc.Utf8);
  } catch (e) { return ''; }
}

// 河马 AES-CBC，py: hemaEncrypt / hemaDecrypt
function hemaEnc(plain) {
  try {
    return CryptoJS.AES.encrypt(CryptoJS.enc.Utf8.parse(plain), CryptoJS.enc.Utf8.parse(HEMA_KEY), { iv: CryptoJS.enc.Utf8.parse(HEMA_IV), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }).toString();
  } catch (e) { return ''; }
}

function hemaDec(cipherB64) {
  try {
    const s = CryptoJS.AES.decrypt(cipherB64, CryptoJS.enc.Utf8.parse(HEMA_KEY), { iv: CryptoJS.enc.Utf8.parse(HEMA_IV), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }).toString(CryptoJS.enc.Utf8);
    return s || '{}';
  } catch (e) { return '{}'; }
}

// 山海 AES-GCM 解密（仅解 payload，不校验 tag）
// 12 字节 nonce: J0 = nonce||00000001，首块密文 counter = nonce||00000002
// 其他长度 nonce: J0 = GHASH_H(nonce || pad || [0]^64 || [len bits]^64)（QJS 支持 BigInt）
function gf128Mul(x, y) {
  const R = 0xe1000000000000000000000000000000n;
  let z = 0n;
  let v = x;
  for (let b = 0; b < 128; b++) {
    if ((y >> BigInt(127 - b)) & 1n) z ^= v;
    v = (v & 1n) ? ((v >> 1n) ^ R) : (v >> 1n);
  }
  return z;
}

function ghashJ0(nonceHex, key) {
  try {
    const zero = CryptoJS.AES.encrypt(CryptoJS.enc.Hex.parse('00000000000000000000000000000000'), key, { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.NoPadding });
    const H = BigInt('0x' + zero.ciphertext.toString(CryptoJS.enc.Hex));
    let data = nonceHex;
    while (data.length % 32 !== 0) data += '0';
    data += '0000000000000000' + (nonceHex.length * 4).toString(16).padStart(16, '0');
    let y = 0n;
    for (let i = 0; i < data.length; i += 32) {
      y = gf128Mul(y ^ BigInt('0x' + data.slice(i, i + 32)), H);
    }
    return y.toString(16).padStart(32, '0');
  } catch (e) {
    return '';
  }
}

function gcmDecrypt(hexCipher, hexNonce) {
  try {
    if (!hexCipher || !hexNonce || hexNonce.length < 2 || hexNonce.length % 2 !== 0) return {};
    const key = CryptoJS.enc.Utf8.parse(SH_KEY);
    const payloadHex = hexCipher.slice(0, hexCipher.length - 32); // 去掉 16 字节 tag
    if (payloadHex.length <= 0) return {};
    const nBlocks = Math.ceil(payloadHex.length / 32);
    // 计算初始计数块 J0
    let j0;
    if (hexNonce.length === 24) {
      j0 = hexNonce + '00000001';
    } else {
      j0 = ghashJ0(hexNonce, key);
      if (!j0) return {};
    }
    const j0High = j0.slice(0, 24);
    const j0Low = parseInt(j0.slice(24), 16);
    const ks = [];
    for (let i = 0; i < nBlocks; i++) {
      const ctrHex = j0High + ((j0Low + 1 + i) >>> 0).toString(16).padStart(8, '0');
      const e = CryptoJS.AES.encrypt(CryptoJS.enc.Hex.parse(ctrHex), key, { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.NoPadding });
      for (let w = 0; w < 4; w++) ks.push(e.ciphertext.words[w]);
    }
    const payload = CryptoJS.enc.Hex.parse(payloadHex);
    const words = payload.words.map((w, i) => w ^ (ks[i] || 0));
    const pt = CryptoJS.lib.WordArray.create(words, payload.sigBytes);
    return JSON.parse(CryptoJS.enc.Utf8.stringify(pt));
  } catch (e) {
    return {};
  }
}

// 薏米 RSA-SHA256 签名：优先 WebCrypto(pkcs8)，失败回退 JSEncrypt.sign
async function yimiSign(data) {
  try {
    const pemBody = YIMI_PEM.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
    const der = Buffer.from(pemBody, 'base64');
    const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(data));
    return Buffer.from(new Uint8Array(sig)).toString('base64');
  } catch (e) {
    try {
      const jse = new JSEncrypt();
      jse.setPrivateKey(YIMI_PEM);
      const s = jse.sign(data, (t) => crypto.createHash('sha256').update(t).digest('hex'), 'sha256');
      return s || '';
    } catch (e2) {
      log('【薏米签名失败】' + (e && e.message ? e.message : e));
      return '';
    }
  }
}

async function yimiHeaders(path, params, sec) {
  const ts = String(Date.now());
  const str3 = '&' + params + '&' + path + '&' + ts + '&' + sec;
  const sign = await yimiSign(str3);
  return {
    'x-appid': 'zy9351ae',
    'x-sig-timestamp': ts,
    'x-sig-alg': 'RSA-SHA256',
    'x-sig-sign': sign,
    'x-sig-ver': 'v1.1',
    'x-sig-sec': sec,
    'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 15; 22081212C Build/AQ3A.241006.001)',
  };
}

// ---------------------------- 会话态读取 ----------------------------
function xyHeaders(ctx) {
  return ctx.store.get('xy_h', { 'User-Agent': DEF_UA, 'Content-Type': 'application/json' });
}

function nnHeaders(ctx) {
  return ctx.store.get('nn_h', Object.assign({}, HEADERS.niuniu, { token: '', deviceid: '' }));
}

// ---------------------------- 牛牛加密通道 ----------------------------
async function niuniuPost(ctx, url1, data1, index) {
  try {
    const t10 = String(Math.floor(Date.now() / 1000));
    const nonce = 'X9UknYKtLa3DmtjC';
    let body1 = data1
      .replace(/&lock_free=\d+/, '&lock_free=1')
      .replace(/&timestamp=\d+/, '&timestamp=' + t10)
      .replace(/&count=\d+/, '&count=1')
      .replace(/&index=\d+/, '&index=' + String(index))
      .replace(/&lock_ad=\d+/, '&lock_ad=1')
      .replace(/&lock_index=\d+/, '&lock_index=' + String(index));
    const enc = aesEncECB(body1, 'ce49b18dd4e0a4d8');
    const sign = hmac256Hex(t10 + nonce + body1, 'aceaa47f96b4875d446b2e1d97e03bbb');
    const res = await http(ctx, url1, {
      method: 'POST',
      headers: { 'X-Salt': 'FD8188A8D5', 'X-Nonce': nonce, 'X-Timestamp': t10, 'X-Access-Token': ctx.store.get('nn_at', ''), 'X-Signature': sign, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'okhttp/4.12.0' },
      body: enc,
      timeout: 20000,
    });
    const dec = res ? aesDecECB(res, 'ce49b18dd4e0a4d8') : '';
    return safeJson(dec);
  } catch (e) {
    return {};
  }
}

// ---------------------------- 山海加密通道 ----------------------------
async function shanhaiauth(ctx) {
  if (ctx.store.get('sh_t', '')) return;
  try {
    const body = JSON.stringify({
      device: '22ebfeec0a5ad3c0397bae448b8658cc3', install_first_open: true,
      first_install_time: 1751687627754, last_update_time: 1751687627754,
      report_link_url: '', android_id: '8f7db6f23d745890', package_name: 'com.shanhai.duanju',
      authorization: '', timestamp: Date.now(),
    });
    const enc = aesEncECB(body, 'B@ecf920Od8A4df7');
    const res = await http(ctx, RULES.山海.login, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: enc });
    if (res) {
      const r = JSON.parse(res);
      if (r.data && r.data.token) ctx.store.set('sh_t', r.data.token);
    }
  } catch (e) { /* ignore */ }
}

async function shanhaifetch(ctx, url, method, data) {
  let token = ctx.store.get('sh_t', '');
  if (!token) {
    await shanhaiauth(ctx);
    token = ctx.store.get('sh_t', '');
  }
  if (!token) return {};
  const headers = { authorization: token, 'Content-Type': 'application/json' };
  try {
    const resp = await http(ctx, url, method === 'POST' ? { method: 'POST', headers, body: data } : { headers });
    if (!resp) return {};
    const res = JSON.parse(resp);
    const d = res.data;
    if (!d) return {};
    if (d.data && d.nonce) return gcmDecrypt(d.data, d.nonce); // 加密响应
    if (typeof d === 'object' && !Array.isArray(d) && (d.theaters || d.title || d.items || d.search_data)) return d; // 明文响应（接口新版直接返回）
    return {};
  } catch (e) {
    return {};
  }
}

// ---------------------------- 七猫请求头 ----------------------------
function qmHeaders() {
  const sessionId = String(Date.now());
  const js = JSON.stringify({
    static_score: '0.8', uuid: '00000000-7fc7-08dc-0000-000000000000', 'device-id': '20250220125449b9b8cac84c2dd3d035c9052a2572f7dd0122edde3cc42a70', mac: '',
    sourceuid: 'aa7de295aad621a6', 'refresh-type': '0', model: '22021211RC', 'wlb-imei': '', 'client-id': 'aa7de295aad621a6', brand: 'Redmi',
    oaid: '', 'oaid-no-cache': '', 'sys-ver': '12', 'trusted-id': '', 'phone-level': 'H', imei: '', 'wlb-uid': 'aa7de295aad621a6', 'session-id': sessionId,
  });
  const b64 = base64Encode(js).replace(/\n/g, '').replace(/\r/g, '').replace(/ /g, '');
  let qm = '';
  for (const c of b64) qm += CHAR_MAP[c] !== undefined ? CHAR_MAP[c] : c;
  const sign = md5('AUTHORIZATION=app-version=10001application-id=com.duoduo.readchannel=unknownis-white=net-env=5platform=androidqm-params=' + qm + 'reg=' + KEYS);
  return { 'net-env': '5', reg: '', channel: 'unknown', 'is-white': '', platform: 'android', 'application-id': 'com.duoduo.read', AUTHORIZATION: '', 'app-version': '10001', 'User-Agent': 'okhttp/4.10.0', 'qm-params': qm, sign, 'Content-Type': 'application/json' };
}

// ---------------------------- 分类（category 各平台实现） ----------------------------
// 河马
async function catHema(ctx, p, area, page) {
  const a = area.split('@');
  const body = hemaEnc(JSON.stringify({ recSwitch: true, storePageId: 10002, channelGroupId: '10', channelId: a[0] || '10', channelName: a.length > 1 ? a[1] : '男频', pageFlag: page, theaterSubscriptSwitch: true }));
  const res = safeJson(await http(ctx, p.host + p.list, { method: 'POST', headers: HEADERS.hema, body }));
  const data = safeJson(hemaDec(res.data || ''));
  const out = [];
  for (const v of ((((data.columnData || [{}])[0]).videoData) || [])) {
    out.push({ vod_id: '河马@' + v.bookId, vod_name: v.bookName || '', vod_pic: v.coverWap || '', vod_remarks: '河马短剧 | ' + (v.finishStatusCn || ''), vod_content: '' });
  }
  return out;
}

// 七猫
async function catQimao(ctx, p, area, page) {
  const params = { operation: 1, playlet_privacy: 1 };
  if (area) params.tag_id = area;
  if (page > 1) params.next_id = page;
  params.sign = md5(Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('') + KEYS);
  const res = safeJson(await http(ctx, p.host + p.list + '?' + Object.keys(params).map((k) => `${k}=${encodeURIComponent(params[k])}`).join('&'), { headers: qmHeaders() }));
  const out = [];
  for (const it of ((res.data || {}).list) || []) {
    const num = it.total_episode_num;
    out.push({ vod_id: '七猫@' + encodeURIComponent(String(it.playlet_id || it.id || '')), vod_name: it.title || '', vod_pic: it.image_link || '', vod_remarks: '七猫短剧 | ' + (num ? num + '集' : ''), vod_content: it.tags || '' });
  }
  return out;
}

// 百度
async function catBaidu(ctx, p, area, page) {
  const sub = ['新剧', '限时免费', '精选', '独播'].indexOf(area) >= 0 ? area : '新剧';
  const tcsub = ['全部', '全部题材'].indexOf(area) >= 0 ? '' : area;
  const t = Math.floor(Date.now() / 1000);
  const version = md5(String(t) + 'v2');
  const inner = JSON.stringify({ data: { extRequest: { flow_tabid: '13' }, from: 'feed', page: 'channel_video_landing', pd: 'feed', refreshIndex: page, cursor: '', theme: '', timestamp: t, version, themes: [{ kind: '综合', names: [sub] }, { kind: '题材', names: [tcsub] }] } });
  const res = safeJson(await http(ctx, p.host + p.list, { method: 'POST', headers: HEADERS.baidu, body: 'data=' + encodeURIComponent(inner) }));
  const out = [];
  for (const it of (((res.data || {}).items) || []).slice(0, 20)) {
    out.push({ vod_id: '百度@' + it.collId, vod_name: it.title || '未知短剧', vod_pic: it.img || '', vod_remarks: '百度短剧 | ' + (it.updateStatus || '更新中'), vod_content: it.description || '' });
  }
  return out;
}

// 牛牛
async function catNiuniu(ctx, p, area, page) {
  const condition = { typeId: 'S1' };
  if (area && area !== '全部') condition.classify = area;
  const res = safeJson(await http(ctx, p.host + p.list, { method: 'POST', headers: nnHeaders(ctx), body: JSON.stringify({ condition, pageNum: page, pageSize: 24 }), timeout: 15000 }));
  const out = [];
  for (const it of ((res.data || {}).records) || []) {
    out.push({ vod_id: '牛牛@' + it.id, vod_name: it.name || '', vod_pic: it.cover || '', vod_remarks: '牛牛短剧 | ' + (it.totalEpisode ? it.totalEpisode + '集' : ''), vod_content: it.description || '' });
  }
  return out;
}

// 围观
async function catWeiguan(ctx, p, area, page) {
  const res = safeJson(await http(ctx, p.host + p.search, { method: 'POST', body: JSON.stringify({ audience: '全部受众', page, pageSize: 30, searchWord: '', subject: '全部主题' }) }));
  const out = [];
  for (const it of res.data || []) {
    out.push({ vod_id: '围观@' + it.oneId, vod_name: it.title || '未知短剧', vod_pic: it.vertPoster || it.horizonPoster || '', vod_remarks: '围观短剧 | 集数:' + (it.episodeCount || 0), vod_content: it.description || '' });
  }
  return out;
}

// 西饭
async function catXifan(ctx, p, area, page) {
  const pp = area.split('@').concat(['都市']);
  const typeId = pp[0];
  const typeName = pp[1];
  const offset = (page - 1) * 30;
  const ts = Math.floor(Date.now() / 1000);
  const url = `${p.host}${p.list}?reqType=aggregationPage&offset=${offset}&categoryId=${typeId}&quickEngineVersion=-1&scene=&categoryNames=${encodeURIComponent(typeName)}&categoryVersion=1&density=1.5&pageID=page_theater&version=2001001&androidVersionCode=28&requestId=${ts}aa498144140ef297&appId=drama&teenMode=false&userBaseMode=false`;
  const res = safeJson(await http(ctx, url));
  const out = [];
  for (const soup of ((res.result || {}).elements) || []) {
    for (const vod of soup.contents || []) {
      const dj = vod.duanjuVo || {};
      if (dj.duanjuId) out.push({ vod_id: `西饭@${dj.duanjuId}#${dj.source}`, vod_name: dj.title || '', vod_pic: dj.coverImageUrl || '', vod_remarks: '西饭短剧 | 推荐', vod_content: dj.desc || '' });
    }
  }
  return out;
}

// 星星
async function catXingxing(ctx, p, area, page) {
  const params = { productId: '2a8c14d1-72e7-498b-af23-381028eb47c0', vestId: '2be070e0-c824-4d0e-a67a-8f688890cadb', channel: 'oppo19', osType: 'android', version: '20', token: '202509271001001446030204698626', resourceId: area, pageNum: String(page), pageSize: '20' };
  const res = safeJson(await http(ctx, p.host + p.list + '?' + Object.keys(params).map((k) => `${k}=${encodeURIComponent(params[k])}`).join('&'), { headers: HEADERS.xingxing }));
  const out = [];
  for (const vod of ((res.data || {}).datalist) || []) {
    out.push({ vod_id: `星星@${vod.id}@${encodeURIComponent(vod.introduction || '')}`, vod_name: vod.name || '', vod_pic: vod.icon || '', vod_remarks: `星星短剧 | ${vod.heat || 0}万播放`, vod_content: vod.introduction || '' });
  }
  return out;
}

// 好看
async function catHaokan(ctx, p, area, page) {
  const res = safeJson(await http(ctx, p.host + p.list, { method: 'POST', headers: HEADERS.haokan, body: `tag_id=${area}&rn=20&pn=${page}` }));
  const out = [];
  for (const item of ((res.data || {}).list) || []) {
    const tags = item.tags || [];
    out.push({ vod_id: '好看@' + item.playlet_id, vod_name: item.playlet_title || '', vod_pic: item.playlet_poster || '', vod_remarks: '好看短剧 | ' + (item.episodes_num_text || ''), vod_content: Array.isArray(tags) ? tags.join('·') : String(tags) });
  }
  return out;
}

// 星芽
async function catXingya(ctx, p, area, page) {
  const res = safeJson(await http(ctx, `${p.host}${p.list}=${area}&type=1&class2_ids=0&page_num=${page}&page_size=24`, { headers: xyHeaders(ctx) }));
  const out = [];
  for (const it of ((res.data || {}).list) || []) {
    const th = it.theater || {};
    out.push({ vod_id: '星芽@' + th.id, vod_name: th.title || '', vod_pic: th.cover_url || '', vod_remarks: '星芽短剧 | ' + (th.total ? th.total + '集' : ''), vod_content: '播放量:' + (th.play_amount_str || 0) });
  }
  return out;
}

// 山海
async function catShanhai(ctx, p, area, page) {
  const url = `${p.host}${p.list}?theater_class_id=1&type=1&class2_ids=${area}&page_num=${page}&page_size=24`;
  const res = await shanhaifetch(ctx, url);
  const out = [];
  for (const item of res.items || []) {
    const th = item.theater || {};
    out.push({ vod_id: '山海@' + th.id, vod_name: th.title || '', vod_pic: th.cover_url || '', vod_remarks: `山海短剧 | 共${th.total || 0}集`, vod_content: '' });
  }
  return out;
}

// 薏米
async function catYimi(ctx, p, area, page) {
  const path = '/bookstore/local/visual/channel/list';
  const baseParams = `key=${area}&p1=1750574688516674369&p16=22081212C&p2=341201&p21=10&p22=15&p24=0&p25=21200&p28=cca83346da195d11&p29=zy9351ae&p3=102120009&p31=29d1af74b128f29f&p33=com.zhangyue.app.shortplay&p34=force_fsg_nav_bar&p35=BUZGFVakskazFWG2XwZ/LNs4fOnQczc4iivy1qLFvZqmerp2Abe2hv5Tu1jOHQJO5PGANizg3JbzgaTOon0qkmQ==&p4=501609&p5=16&p7=cca83346da195d11&p9=3&page=${page}&pc=10&usr=tj1290623468&zyeid=4fc4c6737a87b603e1b8ce9210032bae`;
  const headers = await yimiHeaders(path, baseParams, 'AAF4IWZnITkqeX4hJCB5eio4IWc4IH4=');
  const response = await http(ctx, p.host + path + '?' + baseParams, { headers });
  const out = [];
  if (response) {
    const json_data = safeJson(response);
    const list_data = (json_data.body || {}).list || [];
    if (Array.isArray(list_data) && list_data.length > 0) {
      for (const item of list_data[0].short_plays || []) {
        if (item.id) out.push({ vod_id: '薏米@' + item.id, vod_name: item.short_play_name || '', vod_pic: item.cover_url || '', vod_remarks: `薏米短剧 | 热度值:${item.favor_count_format || 0}`, vod_content: '' });
      }
    }
  }
  return out;
}

// 爽爽
async function catShuangshuang(ctx, p, area, page) {
  const fa = area || '女频恋爱';
  const html = await http(ctx, `${p.host}/show/duanju---${encodeURIComponent(fa)}-----${page}---.html`, { headers: { 'User-Agent': MOBILE_UA } });
  const out = [];
  const cards = html.match(/<div class="a-con-inner">[\s\S]*?<\/div>(?=\s*<div class="a-con-inner"|$)/gi) || [];
  for (const c of cards) {
    const tm = c.match(/<a[^>]*title="([^"]+)"[^>]*>/);
    const um = c.match(/<a[^>]*href="([^"]+)"[^>]*>/);
    if (tm && um) {
      const pic_m = c.match(/<img[^>]*data-original="([^"]+)"/);
      const rem_m = c.match(/<span[^>]*>([^<]+)<\/span>/);
      out.push({ vod_id: `爽爽@${encodeURIComponent(um[1])}`, vod_name: tm[1], vod_pic: pic_m ? pic_m[1] : '', vod_remarks: '爽爽短剧 | ' + (rem_m ? rem_m[1] : '') });
    }
  }
  return out;
}

// 喜福
async function catXifu(ctx, p, area, page) {
  let cid = area;
  const cats = ctx.store.get('xf_cats', []);
  if (!cid && cats.length) cid = String(cats[0].id);
  let u = `${p.host}${p.dramaList}?pageSize=24&currentPage=${page}`;
  if (cid) u += `&filterCategories[]=${cid}`;
  const res = safeJson(await http(ctx, u, { headers: HEADERS.web }));
  const out = [];
  for (const v of ((res.data || {}).data) || []) {
    out.push({ vod_id: `喜福@${v.albumId}@${v.total}`, vod_name: v.title || '', vod_pic: v.coverUrl || '', vod_remarks: `喜福短剧 | 共${v.total || 0}集` });
  }
  return out;
}

// 五五（HTML 列表解析，对齐 py: parseWuWuList）
function parseWuWuList(html, host) {
  const items = {};
  const regexArr = [
    { name: 'SecondList_bookName', img: 'SecondList_bookImage', rem: 'SecondList_totalChapterNum' },
    { name: 'TagBookList_bookName', img: 'TagBookList_bookImageBox', rem: 'TagBookList_totalChapterNum' },
    { name: 'BrowseList_bookName', img: 'BrowseList_imageBox', rem: 'BrowseList_totalChapterNum' },
  ];
  for (const pat of regexArr) {
    const reName = new RegExp(`<a[^>]*class="[^"]*\\b${pat.name}\\b[^"]*"[^>]*href="[^"]*vod/detail/id/(\\d+)\\.html"[^>]*>([\\s\\S]*?)</a>`, 'gi');
    for (const m of html.matchAll(reName)) {
      const idv = m[1];
      const rawName = m[2];
      if (!items[idv]) items[idv] = { id: idv, name: '', pic: '', rem: '' };
      const sm = rawName.match(/<span[^>]*>([^<]+)<\/span>/i);
      items[idv].name = sm ? sm[1].trim() : stripTags(rawName).trim();
    }
    const reImg = new RegExp(`<a[^>]*class="[^"]*\\b${pat.img}\\b[^"]*"[^>]*href="[^"]*vod/detail/id/(\\d+)\\.html"[^>]*>([\\s\\S]*?)</a>`, 'gi');
    for (const m of html.matchAll(reImg)) {
      if (items[m[1]]) {
        const im = m[2].match(/<img[^>]*\bsrc="([^"]+)"/i);
        if (im) items[m[1]].pic = im[1].startsWith('http') ? im[1] : host + im[1];
      }
    }
    const reRem = new RegExp(`<a[^>]*class="[^"]*\\b${pat.rem}\\b[^"]*"[^>]*href="[^"]*vod/detail/id/(\\d+)\\.html"[^>]*>([\\s\\S]*?)</a>`, 'gi');
    for (const m of html.matchAll(reRem)) {
      if (items[m[1]]) items[m[1]].rem = stripTags(m[2]).trim();
    }
  }
  return Object.values(items);
}

async function catWuwu(ctx, p, area, page) {
  const u = area === '全部' ? `${p.host}/index.php/vod/type/id/1.html` : `${p.host}/index.php/vod/show/class/${encodeURIComponent(area)}/id/1.html`;
  const url = page > 1 ? u + `?page=${page}` : u;
  const html = await http(ctx, url, { headers: HEADERS.default });
  const out = [];
  for (const v of parseWuWuList(html, p.host)) {
    out.push({ vod_id: `五五@${v.id}`, vod_name: v.name, vod_pic: v.pic, vod_remarks: '五五短剧 | ' + v.rem });
  }
  return out;
}

const CAT_DISPATCH = {
  河马: catHema, 七猫: catQimao, 百度: catBaidu, 牛牛: catNiuniu, 围观: catWeiguan, 西饭: catXifan,
  星星: catXingxing, 好看: catHaokan, 星芽: catXingya, 山海: catShanhai, 薏米: catYimi,
  爽爽: catShuangshuang, 喜福: catXifu, 五五: catWuwu,
};

// ---------------------------- 搜索（search 各平台实现） ----------------------------
// 河马
async function seaHema(ctx, p, wd, page) {
  const body = hemaEnc(JSON.stringify({ keyword: wd, page, size: 15, searchSource: '搜索按钮', hotWordType: 2, tagIds: '', reservationSwitch: true }));
  const data = safeJson(hemaDec(safeJson(await http(ctx, p.host + p.search, { method: 'POST', headers: HEADERS.hema, body })).data || ''));
  const out = [];
  for (const v of data.searchVos || []) {
    out.push({ vod_id: '河马@' + v.bookId, vod_name: v.bookName || '', vod_pic: v.coverWap || '', vod_remarks: '河马 | ' + (v.finishStatusCn || '') });
  }
  return out;
}

// 七猫
async function seaQimao(ctx, p, wd, page) {
  const params = { extend: '', page: String(page), read_preference: '0', track_id: 'ec1280db127955061754851657967', wd };
  params.sign = md5(Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('') + KEYS);
  const data = safeJson(await http(ctx, p.host + p.search + '?' + Object.keys(params).map((k) => `${k}=${encodeURIComponent(params[k])}`).join('&'), { headers: qmHeaders() })).data || {};
  const out = [];
  for (const it of data.list || []) {
    out.push({ vod_id: '七猫@' + encodeURIComponent(String(it.id || it.playlet_id || '')), vod_name: stripTags(it.title || '').trim(), vod_pic: it.image_link || '', vod_remarks: '七猫 | ' + String(it.total_num || '') });
  }
  return out;
}

// 百度
async function seaBaidu(ctx, p, wd, page) {
  const t = Math.floor(Date.now() / 1000);
  const version = md5(String(t) + 'v2');
  const post = 'data=' + encodeURIComponent(JSON.stringify({ data: { from: 'feed', pd: 'feed', query: wd, refreshIndex: page, timestamp: t, version } }));
  const res = safeJson(await http(ctx, p.host + p.search, { method: 'POST', headers: HEADERS.baidu, body: post }));
  const out = [];
  for (const it of (((res.data || {}).items) || [])) {
    out.push({ vod_id: '百度@' + it.collId, vod_name: it.title || '', vod_pic: it.img || '', vod_remarks: '百度 | ' + (it.updateStatus || '更新中') });
  }
  return out;
}

// 牛牛
async function seaNiuniu(ctx, p, wd, page) {
  const res = safeJson(await http(ctx, p.host + p.search, { method: 'POST', headers: nnHeaders(ctx), body: JSON.stringify({ condition: { typeId: 'S1', value: wd }, pageNum: page, pageSize: 24 }), timeout: 15000 }));
  const out = [];
  for (const it of ((res.data || {}).records) || []) {
    out.push({ vod_id: '牛牛@' + it.id, vod_name: it.name || '', vod_pic: it.cover || '', vod_remarks: '牛牛 | ' + (it.totalEpisode ? it.totalEpisode + '集' : '') });
  }
  return out;
}

// 围观
async function seaWeiguan(ctx, p, wd, page) {
  const res = safeJson(await http(ctx, p.host + p.search, { method: 'POST', body: JSON.stringify({ audience: '全部受众', page, pageSize: 30, searchWord: wd, subject: '全部主题' }) }));
  const out = [];
  for (const it of res.data || []) {
    out.push({ vod_id: '围观@' + it.oneId, vod_name: it.title || '', vod_pic: it.vertPoster || it.horizonPoster || '', vod_remarks: `围观 | 集数:${it.episodeCount || 0}` });
  }
  return out;
}

// 西饭
async function seaXifan(ctx, p, wd, page) {
  const ts = Math.floor(Date.now() / 1000);
  const url = `${p.host}${p.search}?keyword=${encodeURIComponent(wd)}84&pageIndex=${page}&version=2001001&androidVersionCode=28&requestId=${ts}ea3a14bc0317d76f&appId=drama&teenMode=false&userBaseMode=false`;
  const res = safeJson(await http(ctx, url));
  const out = [];
  for (const soup of ((res.result || {}).elements) || []) {
    for (const vod of soup.contents || []) {
      const dj = vod.duanjuVo || {};
      out.push({ vod_id: `西饭@${dj.duanjuId}#${dj.source}`, vod_name: dj.title || '', vod_pic: dj.coverImageUrl || '', vod_remarks: '西饭 | 推荐' });
    }
  }
  return out;
}

// 好看
async function seaHaokan(ctx, p, wd, page) {
  const res = safeJson(await http(ctx, p.host + p.search, { method: 'POST', headers: HEADERS.haokan, body: 'search_word=' + encodeURIComponent(wd) }));
  const out = [];
  for (const item of res.data || []) {
    out.push({ vod_id: '好看@' + item.id, vod_name: item.title || '', vod_pic: item.cover_url || '', vod_remarks: '好看 | ' + (item.tag ? String(item.tag).replace(/\//g, '·') : '') });
  }
  return out;
}

// 星芽
async function seaXingya(ctx, p, wd, page) {
  const res = safeJson(await http(ctx, p.host + p.search, { method: 'POST', headers: xyHeaders(ctx), body: 'text=' + encodeURIComponent(wd) }));
  const data = ((((res.data || {}).theater) || {}).search_data) || [];
  const out = [];
  for (const item of data) {
    out.push({ vod_id: '星芽@' + item.id, vod_name: item.title || '', vod_pic: item.cover_url || '', vod_remarks: '星芽 | ' + (item.total ? item.total + '集' : ''), vod_content: item.introduction || '' });
  }
  return out;
}

// 山海
async function seaShanhai(ctx, p, wd, page) {
  const out = [];
  try {
    const res = await shanhaifetch(ctx, `${p.host}${p.search}?text=${encodeURIComponent(wd)}`);
    const search_data = res.search_data || res.data || [];
    for (const i of search_data) {
      out.push({ vod_id: '山海@' + i.id, vod_name: i.title || '', vod_pic: i.cover_url || '', vod_remarks: `山海 | ${i.total || 0}集`, vod_content: i.introduction || '' });
    }
  } catch (e) { /* ignore */ }
  return out;
}

// 薏米
async function seaYimi(ctx, p, wd, page) {
  const out = [];
  try {
    const su = `/bookstore/search/recommend_data?keyword=${encodeURIComponent(wd)}&p1=1750574688516674369&p16=22081212C&p2=341201&p21=3&p22=15&p24=0&p25=21200&p28=cca83346da195d11&p29=zy9351ae&p3=102120009&p31=29d1af74b128f29f&p33=com.zhangyue.app.shortplay&p34=force_fsg_nav_bar&p35=BUZGFVakskazFWG2XwZ/LNs4fOnQczc4iivy1qLFvZqmerp2Abe2hv5Tu1jOHQJO5PGANizg3JbzgaTOon0qkmQ==&p4=501609&p5=16&p7=cca83346da195d11&p9=3&page=1&pc=10&resource_type=short_play&size=10&sort=1&source_type=0,1&type=0&usr=tj1290623468&zyeid=4fc4c6737a87b603e1b8ce9210032bae`;
    const path = '/bookstore/search/recommend_data';
    const s1 = su.split('?')[1];
    const headers = await yimiHeaders(path, s1, 'AAF4IWZnITkqeX4hJCB5eio4IWc4IH4=');
    const res = safeJson(await http(ctx, p.host + su, { headers }));
    const list = (((res.body || {}).short_play) || {}).list || [];
    for (const data of list) {
      out.push({ vod_id: '薏米@' + data.id, vod_name: data.name || '', vod_pic: data.pic || '', vod_remarks: `薏米 | 播放量:${data.popularity || 0}`, vod_content: '' });
    }
    if (out.length && wd) return out.filter((it) => it.vod_name && it.vod_name.indexOf(wd) >= 0);
  } catch (e) { /* ignore */ }
  return out;
}

// 爽爽
async function seaShuangshuang(ctx, p, wd, page) {
  const html = await http(ctx, `${p.host}${p.searchUrl}?wd=${encodeURIComponent(wd)}`, { headers: { 'User-Agent': MOBILE_UA } });
  const out = [];
  const sc = html.match(/<div[^>]*class="search-con"[^>]*>[\s\S]*?<\/div>/);
  if (sc) {
    const items = sc[0].match(/<li[^>]*>[\s\S]*?<\/li>/gi) || [];
    for (const it of items) {
      const tm = it.match(/<a[^>]*title="([^"]+)"[^>]*>/);
      const um = it.match(/<a[^>]*href="([^"]+)"[^>]*>/);
      if (tm && um) {
        const pm = it.match(/<img[^>]*data-original="([^"]+)"/);
        const rm = it.match(/<span[^>]*class="state"[^>]*>([^<]+)<\/span>/);
        out.push({ vod_id: `爽爽@${encodeURIComponent(um[1])}`, vod_name: tm[1], vod_pic: pm ? pm[1] : '', vod_remarks: '爽爽 | ' + (rm ? rm[1] : '') });
      }
    }
  }
  return out;
}

// 五五
async function seaWuwu(ctx, p, wd, page) {
  let su = `${p.host}${p.search}${encodeURIComponent(wd)}.html`;
  if (page > 1) su += `?page=${page}`;
  const html = await http(ctx, su, { headers: HEADERS.default });
  const out = [];
  for (const v of parseWuWuList(html, p.host)) {
    out.push({ vod_id: `五五@${v.id}`, vod_name: v.name, vod_pic: v.pic, vod_remarks: '五五 | ' + v.rem });
  }
  return out;
}

const SEA_DISPATCH = {
  河马: seaHema, 七猫: seaQimao, 百度: seaBaidu, 牛牛: seaNiuniu, 围观: seaWeiguan, 西饭: seaXifan,
  好看: seaHaokan, 星芽: seaXingya, 山海: seaShanhai, 薏米: seaYimi, 爽爽: seaShuangshuang, 五五: seaWuwu,
};

// ---------------------------- 详情（detail 各平台实现，返回 vod patch） ----------------------------
// 河马
async function detHema(ctx, p, did) {
  const body = hemaEnc(JSON.stringify({ bookId: did, needNextChapter: 0, isNeedAlias: '', bookAlias: '', resolutionRate: '720P' }));
  const res = safeJson(await http(ctx, p.host + p.detail, { method: 'POST', headers: HEADERS.hema, body }));
  const data = safeJson(hemaDec(res.data || ''));
  const info = data.videoInfo || {};
  const chapters = data.chapterList || [];
  const last = chapters.length ? (chapters[chapters.length - 1].chapterId || '') : '';
  return {
    vod_name: info.bookName || '未知剧名', vod_type: (info.bookTags || []).join(','), vod_pic: info.coverWap || '',
    vod_remarks: info.finishStatusCn || '', vod_actor: (info.protagonist || []).join(','), vod_content: info.introduction || '暂无简介',
    vod_play_from: '河马专线',
    vod_play_url: chapters.map((c) => `${c.chapterName}$${did}@${c.chapterId}@${last}`).join('#'),
  };
}

// 七猫
async function detQimao(ctx, p, did) {
  const did2 = decodeURIComponent(did);
  const sign = md5('playlet_id=' + did2 + KEYS);
  const res = safeJson(await http(ctx, `${p.detail}?playlet_id=${did2}&sign=${sign}`, { headers: qmHeaders() }));
  const data = res.data || {};
  return {
    vod_name: data.title || '未知标题', vod_pic: data.image_link || '', vod_remarks: `${data.tags || ''} ${data.total_episode_num || 0}集`, vod_content: data.intro || '未知剧情',
    vod_play_from: '七猫专线',
    vod_play_url: (data.play_list || []).map((it) => `${it.sort}$${it.video_url}`).join('#'),
  };
}

// 百度
async function detBaidu(ctx, p, did) {
  const res = safeJson(await http(ctx, p.detailHost + p.detail, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'playlet_id=' + encodeURIComponent(did) + '&vid=undefined' }));
  const d = res.data || {};
  const vids = d.vid_list || [];
  return {
    vod_name: d.playlet_title || '未知短剧', vod_pic: d.playlet_poster || '',
    vod_content: `热度值:${d.hot_value || 0}\n题材:${d.tag_text || ''}\n集数:${d.episodes_num || 0}\n简介:${d.description || ''}`,
    vod_remarks: `共${vids.length}集`, vod_director: d.tag_text || '', vod_year: d.create_time || '',
    vod_play_from: '百度专线',
    vod_play_url: vids.map((v, i) => `第${i + 1}集$${did}@${v}`).join('#'),
  };
}

// 牛牛
async function detNiuniu(ctx, p, did) {
  const desc = (safeJson(await http(ctx, p.host + p.desc, { method: 'POST', headers: nnHeaders(ctx), body: JSON.stringify({ id: did, typeId: 'S1' }), timeout: 15000 })).data) || {};
  const lst = (safeJson(await http(ctx, p.host + p.detail, { method: 'POST', headers: nnHeaders(ctx), body: JSON.stringify({ id: did, source: 0, typeId: 'S1', userId: '546932' }), timeout: 15000 })).data) || {};
  let playUrls = lst.url ? (lst.episodeList || []).map((ep) => `${ep.episode}$${did}+${ep.id}`).join('#') : '';
  if (!playUrls && lst.thirdPlayId) {
    const thirdPlayId = lst.thirdPlayId;
    const data1 = 'not_include=0&lock_free=1&type=1&clientVersion=v5.2.5&uuid=6IDYUSASPQY5BBVACWQW3LLTPV4V7DE26UOCX5TZTVUGX4VUJNXQ01&resolution=1080*2320&openudid=82f4175d577a2939&dt=22021211RC&os_api=31&install_id=1496879012031075&sdk_version=1.1.3.0&siteid=5627189&dev_log_aid=667431&oaid=abec0dfff623201b&timestamp=1752498494&direction=0&ac=mobile&os=Android&vod_version=1.10.21.6-tob&os_version=12&count=1&index=1&shortplay_id=' + String(thirdPlayId) + '&sha1=46121F77CE2FCAD3DBC3B9EC8A24908C1A8AD6D9&device_brand=Redmi&package_name=com.niuniu.ztdh.app';
    const html1 = await niuniuPost(ctx, p.detail2, data1, '1');
    const ep_list = ((html1.data || {}).episode_right_list) || [];
    playUrls = ep_list.map((it) => `第${it.index}集$${it.index}+${it.lock_type || 'free'}+${thirdPlayId}`).join('#');
  }
  return {
    vod_name: desc.name || lst.name || '未知名称', vod_pic: desc.cover || lst.cover || '',
    vod_content: `类型：${desc.classify || ''}\n评分：${desc.score || ''}\n简介：${desc.introduce || ''}`,
    vod_remarks: `共${desc.totalEpisode || lst.totalEpisode || 0}集`,
    vod_play_from: '牛牛专线',
    vod_play_url: playUrls || '暂无播放地址$0',
  };
}

// 围观
async function detWeiguan(ctx, p, did) {
  const res = safeJson(await http(ctx, `${p.host}${p.detail}&oneId=${did}&page=1&pageSize=1000`));
  const data = res.data || [];
  const first = data.length ? data[0] : {};
  const arr = [];
  for (const ep of data) {
    let ps = ep.playSetting || ep.videoClarityList || [];
    if (typeof ps === 'string') ps = safeJson(ps, {});
    let url = '';
    if (ps && typeof ps === 'object' && !Array.isArray(ps)) {
      url = ps.super || ps.high || ps.normal || ps.url || ps.playUrl || '';
    } else if (Array.isArray(ps) && ps.length) {
      const best = ps.find((x) => ['1080P', '1080p', 'super', '超清'].indexOf(x.clarity) >= 0) || ps[0];
      url = best.url || best.playUrl || '';
    }
    const title = `第${ep.playOrder || ep.episode || arr.length + 1}集`;
    arr.push(`${title}$${url || ep.playUrl || ''}`);
  }
  return {
    vod_name: first.title || '', vod_pic: first.vertPoster || first.horizonPoster || '', vod_remarks: `共${data.length}集`,
    vod_content: `播放量:${first.viewCount || 0} 收藏:${first.collectionCount || 0} 评论:${first.commentCount || 0}`,
    vod_play_from: '围观专线', vod_play_url: arr.join('#'),
  };
}

// 西饭
async function detXifan(ctx, p, did) {
  const dp = did.split('#');
  const duanjuId = dp[0];
  const source = dp.length > 1 ? dp[1] : '';
  const data = (safeJson(await http(ctx, `${p.host}${p.detail}?duanjuId=${duanjuId}&source=${source}`)).result) || {};
  return {
    vod_name: data.title || '', vod_pic: data.coverImageUrl || '', vod_content: data.desc || '未知',
    vod_remarks: data.updateStatus === 'over' ? `${data.total || 0}集 已完结` : `更新${data.total || 0}集`,
    vod_play_from: '西饭专线',
    vod_play_url: (data.episodeList || []).map((ep) => (ep.playUrl ? `${ep.index}$${ep.playUrl}` : '')).filter(Boolean).join('#'),
  };
}

// 星星
async function detXingxing(ctx, p, did) {
  const dp = did.split('@');
  const bookId = dp[0];
  const contentDesc = dp.length > 1 ? dp[1] : '';
  const params = { bookId, productId: '2a8c14d1-72e7-498b-af23-381028eb47c0', vestId: '2be070e0-c824-4d0e-a67a-8f688890cadb', channel: 'oppo19', osType: 'android', version: '20', token: '202509271001001446030204698626' };
  const data = (safeJson(await http(ctx, p.host + p.detail + '?' + Object.keys(params).map((k) => `${k}=${encodeURIComponent(params[k])}`).join('&'), { headers: HEADERS.xingxing })).data) || [];
  const arr = [];
  data.forEach((item, i) => {
    try {
      const u = item.shortPlayList[0].chapterShortPlayVoList[0].shortPlayUrl;
      if (u) arr.push(`第${i + 1}集$${u}`);
    } catch (e) { /* ignore */ }
  });
  return {
    vod_name: '星星短剧', vod_content: decodeURIComponent(contentDesc),
    vod_play_from: '星星专线', vod_play_url: arr.join('#') || '暂无播放地址$0',
  };
}

// 好看
async function detHaokan(ctx, p, did) {
  const commonlistId = String(Date.now()).slice(0, 13);
  const inner = `enable_enter_playlet=0&seek_time=0&hotspot=0&auto_show_hot_point_panel=0&type=playlet&commonlist_id=${commonlistId}&scene=&vid=&enable_atlas=0&mark_pn=&uk=&ctime=0&from=playlet_new&id=${did}&rn=20&pn=1&direction=3`;
  const res1 = safeJson(await http(ctx, p.host + p.detail_list, { method: 'POST', headers: HEADERS.haokan, body: 'video/commonlist=' + encodeURIComponent(inner), timeout: 30000 }));
  const results = ((((res1['video/commonlist'] || {}).data) || {}).results) || [];
  const first = results.length ? results[0] : {};
  const vid = first.vid || (first.content || {}).vid || '';
  let d = {};
  if (vid) {
    d = (safeJson(await http(ctx, p.host + p.detail, { method: 'POST', headers: HEADERS.haokan, body: `vid=${vid}&playlet_id=${did}`, timeout: 20000 })).data) || {};
  }
  let playUrl = '';
  const vids = d.vid_list || (d.results || []).map((x) => x.vid || (x.content || {}).vid).filter(Boolean);
  if (vids.length) {
    playUrl = vids.map((v, i) => `第${i + 1}集$${did}@${v}`).join('#');
  } else {
    const arr = [];
    results.forEach((x, i) => {
      const c = x.content || {};
      const u = c.video_src || c.url || x.video_src || '';
      if (u) arr.push(`${c.title || x.title || `第${i + 1}集`}$${u}`);
    });
    playUrl = arr.join('#');
  }
  const c0 = first.content || {};
  let title = d.playlet_title || c0.title || '';
  title = title.replace(/\s*0*1\s*$/, '').trim() || title;
  return {
    vod_name: title, vod_pic: d.playlet_poster || c0.poster || c0.cover_src || '',
    vod_remarks: `${d.hot_value || ''}播放·${d.episodes_num !== undefined ? d.episodes_num : (results.length || '')}集`,
    vod_director: c0.author || '', vod_content: d.description || c0.title || '',
    vod_play_from: '好看专线', vod_play_url: playUrl || '暂无播放地址$0',
  };
}

// 星芽
async function detXingya(ctx, p, did) {
  const data = (safeJson(await http(ctx, `${p.host}${p.detail}?theater_parent_id=${did}`, { headers: xyHeaders(ctx) })).data) || {};
  return {
    vod_name: data.title || '未知剧名', vod_type: (data.class_two || []).map((c) => c.class_name || '').join(','),
    vod_pic: data.cover_url || '', vod_remarks: data.is_over === 2 ? '连载中' : '已完结',
    vod_content: data.introduction || data.desc || '',
    vod_play_from: '星芽专线',
    vod_play_url: (data.theaters || []).map((it) => `第${it.num}集$${it.son_video_url}`).join('#') || '暂无播放地址$0',
  };
}

// 山海
async function detShanhai(ctx, p, did) {
  const detail = await shanhaifetch(ctx, `${p.host}${p.detail}?theater_parent_id=${did}`);
  const eps = (detail.theaters || []).map((item) => `${item.son_title}$${item.son_video_url}`);
  return {
    vod_name: detail.title || '未知短剧', vod_pic: detail.cover_url || '',
    vod_remarks: `标签:${(detail.desc_tags || []).join(' ')}`, vod_content: detail.introduction || '',
    vod_play_from: '山海短剧', vod_play_url: eps.join('#') || '暂无播放地址$0',
  };
}

// 薏米（分页拉全集）
async function detYimi(ctx, p, did) {
  const patch = { vod_name: '未知剧名', vod_pic: '', vod_content: '', vod_play_from: '薏米短剧', vod_play_url: '暂无播放地址$0' };
  try {
    const path = '/video/client/short_play/episode_list';
    const pageSize = 30;
    let startId = 1;
    let total = 999999;
    const episodes = [];
    let bodyInfo = {};
    const originalStr1 = `end_id=30&p1=1750574688516674369&p16=22081212C&p2=341201&p21=10&p22=15&p24=0&p25=21200&p28=cca83346da195d11&p29=zy9351ae&p3=102120009&p31=29d1af74b128f29f&p33=com.zhangyue.app.shortplay&p34=force_fsg_nav_bar&p35=BUZGFVakskazFWG2XwZ/LNs4fOnQczc4iivy1qLFvZqmerp2Abe2hv5Tu1jOHQJO5PGANizg3JbzgaTOon0qkmQ==&p4=501609&p5=16&p7=cca83346da195d11&p9=3&pc=10&play_id=${did}&start_id=1&usr=tj1290623468&zyeid=4fc4c6737a87b603e1b8ce9210032bae`;
    while (startId <= total) {
      const endId = startId + pageSize - 1;
      let str1 = originalStr1.replace(/(start_id=)\d+/, '$1' + String(startId));
      str1 = str1.replace(/(end_id=)\d+/, '$1' + String(endId));
      const headers = await yimiHeaders(path, str1, 'AAFzKmZkKjIqenUqJCNycSo7Kmw4I3U=');
      const response = await http(ctx, p.host + path + '?' + str1, { headers });
      const json_data = safeJson(response);
      bodyInfo = json_data.body || {};
      const listData = bodyInfo.episode_list || [];
      if (!listData.length) break;
      if (startId === 1) total = bodyInfo.target_count !== undefined ? bodyInfo.target_count : total;
      for (const ep of listData) {
        let playUrl = ep.play_url || '';
        if (playUrl.indexOf('zhangyuecdn') >= 0) playUrl = 'https://mother-t.d.ireader.com' + playUrl.split('com')[1];
        episodes.push(`第${ep.order}集$${playUrl}`);
      }
      startId += pageSize;
    }
    patch.vod_name = bodyInfo.name || '未知剧名';
    patch.vod_content = bodyInfo.introduce || '';
    patch.vod_play_url = episodes.join('#') || '暂无播放地址$0';
  } catch (e) { /* ignore */ }
  return patch;
}

// 爽爽（网页爬取，多线路）
async function detShuangshuang(ctx, p, did) {
  try {
    let du = decodeURIComponent(did);
    du = du.startsWith('http') ? du : p.host + du;
    const html0 = await http(ctx, du, { headers: { 'User-Agent': MOBILE_UA } });
    let fpu = du;
    const mv = html0.match(/<div[^>]*class=["']movbox["'][^>]*>[\s\S]*?<a[^>]*href=["']([^"']+)["']/i);
    if (mv) {
      fpu = mv[1];
    } else {
      const pl = html0.match(/<a[^>]*href=["']([^"']*\/play\/[^"']+)["']/i);
      if (pl) fpu = pl[1];
    }
    if (!fpu.startsWith('http')) fpu = p.host + fpu;

    const playHtml = await http(ctx, fpu, { headers: { 'User-Agent': MOBILE_UA } });
    const tabs = [];
    const tabUrls = [];
    const xl = playHtml.match(/<div[^>]*class=["']xianlu["'][^>]*>([\s\S]*?)<\/div>/i);
    if (xl) {
      for (const m of xl[1].matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)) {
        const th = m[0];
        const hr = th.match(/href=["']([^"']+)["']/i);
        if (hr) {
          let raw = stripTags(th).trim();
          const sm = th.match(/<small[^>]*>([^<]+)<\/small>/i);
          if (sm) raw = raw.replace(sm[1], '').trim();
          tabs.push(raw);
          let u = hr[1];
          if (u.indexOf('javascript') >= 0) u = fpu;
          else if (!u.startsWith('http')) u = p.host + u;
          tabUrls.push(u);
        }
      }
    }
    if (!tabUrls.length) {
      tabs.push('爽爽专线');
      tabUrls.push(fpu);
    }
    const lists = tabUrls.map((u) => `全集$${u}`);

    const vn_m = html0.match(/<h1[^>]*>([^<]+)<\/h1>/);
    const vn = vn_m ? vn_m[1].trim() : '爽爽短剧';
    const vp_m = html0.match(/<img[^>]*data-original="([^"]+)"/);
    const vp = vp_m ? vp_m[1] : '';
    const st = html0.match(/<p[^>]*class=["'][^"']*zhuangtai[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
    const vr = st ? stripTags(st[1]).trim() : '';

    return { vod_name: vn, vod_pic: vp, vod_remarks: vr || '爽爽短剧', vod_content: '', vod_play_from: tabs.join('$$$'), vod_play_url: lists.join('$$$') };
  } catch (e) {
    return { vod_name: '爽爽短剧', vod_play_from: '爽爽专线', vod_play_url: '暂无播放地址$0' };
  }
}

// 喜福（修复 py 版 aid/total 互换的 bug：did = albumId@total）
async function detXifu(ctx, p, did) {
  const dp = did.split('@');
  const aid = dp[0];
  let total = parseInt(dp.length > 1 ? dp[1] : '1', 10);
  if (isNaN(total) || total <= 0) total = 1;
  const items = [];
  for (let i = 1; i <= total; i++) items.push(`${i}$${aid}@${i}`);
  return { vod_name: '喜福短剧', vod_play_from: '喜福专线', vod_play_url: items.join('#') || '暂无播放地址$0' };
}

// 五五（网页爬取，多线路）
async function detWuwu(ctx, p, did) {
  const html = await http(ctx, `${p.host}${p.detail}${did}.html`, { headers: HEADERS.default });
  const tm = html.match(/<title>(.*?)<\/title>/i);
  const vn = tm ? tm[1].split(/[-_|]/)[0].trim() : '五五短剧';

  const im = html.match(/<img[^>]*class="[^"]*\bDramaDetail_bookCover\b[^"]*"[^>]*\bsrc="([^"]+)"/i) || html.match(/property="og:image"[^>]+content="([^"]+)"/i);
  const vp = im ? (im[1].startsWith('http') ? im[1] : p.host + im[1]) : '';

  const cm = html.match(/class="[^"]*(?:detail-content|vod-content|content|descr|intro)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  const vc = cm ? stripTags(cm[1]).trim() : '';

  const sources = [];
  const urls = [];
  const boxes = html.match(/<div class="pcDrama_contentBox[\s\S]*?<\/ul>/gi) || [];
  for (const box of boxes) {
    const titleMatch = box.match(/pcDrama_titleText">([\s\S]*?)<\/h3>/i);
    if (!titleMatch) continue;
    const line = stripTags(titleMatch[1]).trim();
    const eps = [];
    for (const m of box.matchAll(/<a[^>]*class="[^"]*\bpcDrama_catalogItem\b[^"]*"[^>]*href="([^"]*vod\/play\/id\/\d+\/sid\/\d+\/nid\/(\d+)\.html)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      eps.push({ nid: parseInt(m[2], 10), name: m[3].trim() || `第${m[2]}集`, href: m[1] });
    }
    if (eps.length) {
      eps.sort((a, b) => a.nid - b.nid);
      sources.push(line);
      urls.push(eps.map((e) => `${e.name}$${e.href.startsWith('http') ? e.href : p.host + e.href}`).join('#'));
    }
  }
  return { vod_name: vn, vod_pic: vp, vod_content: vc, vod_play_from: sources.join('$$$') || '五五专线', vod_play_url: urls.join('$$$') || '暂无播放地址$0' };
}

const DET_DISPATCH = {
  河马: detHema, 七猫: detQimao, 百度: detBaidu, 牛牛: detNiuniu, 围观: detWeiguan, 西饭: detXifan,
  星星: detXingxing, 好看: detHaokan, 星芽: detXingya, 山海: detShanhai, 薏米: detYimi,
  爽爽: detShuangshuang, 喜福: detXifu, 五五: detWuwu,
};

// ---------------------------- 播放（play 各平台实现） ----------------------------
// 五五
async function playWuwu(ctx, idv) {
  const html = await http(ctx, idv, { headers: { Referer: 'https://www.duanju55.com/' } });
  let vu = '';
  const pm = html.match(/var\s+player_\w+\s*=\s*\{.*?"url"\s*:\s*"([^"]*)"/i);
  if (pm) vu = pm[1].replace(/\\\//g, '/');
  if (!vu) {
    const bm = html.match(/["']url["']\s*:\s*["']([^"']+)["']/i);
    if (bm && /^[A-Za-z0-9+/=]{16,}$/.test(bm[1])) {
      try { vu = base64Decode(bm[1].trim()); } catch (e) { /* ignore */ }
    }
  }
  if (!vu) {
    const vm = html.match(/(?:https?:)?\/\/[^\s"'<>]+\.(?:m3u8|mp4)/i);
    if (vm) vu = vm[0];
    else {
      const im = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
      if (im) vu = im[1];
    }
  }
  if (vu) {
    if (vu.startsWith('//')) vu = 'https:' + vu;
    return { parse: 0, jx: 0, url: vu, header: { 'User-Agent': DEF_UA, Referer: 'https://www.duanju55.com/' } };
  }
  return { parse: 0, jx: 0, url: idv };
}

// 好看 / 百度（清晰度聚合）
async function playBaiduHaokan(ctx, flag, idv) {
  const dp = idv.split('@');
  const playletId = dp[0];
  const vid = dp.length > 1 ? dp[1] : '';
  const inner = `method=post&vid=${vid}&immersive_mode=v4_5&tplname=feed_small_video&tag=playlet_talos&tab=detail&external_from=&is_dp_video=0&immersive_square_type=3&video_set_id=${playletId}&play_screen_type=1&play_volume_type=2&play_external_device_type=1`;
  const isBaidu = flag.indexOf('百度') >= 0;
  const url = isBaidu ? (RULES.百度.detailHost + RULES.百度.play) : (RULES.好看.host + RULES.好看.play);
  const headers = isBaidu ? HEADERS.baidu : HEADERS.haokan;
  const vd = ((((safeJson(await http(ctx, url, { method: 'POST', headers, body: 'video/relate=' + encodeURIComponent(inner) }))['video/relate'] || {}).data) || {}).cur_video) || {};
  const urlMap = {};
  for (const c of vd.clarityUrl || []) {
    if (c.title && c.url) urlMap[c.title] = c.url;
  }
  if (vd.video_list && typeof vd.video_list === 'object' && !Array.isArray(vd.video_list)) {
    for (const k of Object.keys(vd.video_list)) {
      const v = vd.video_list[k];
      if (v && !urlMap[k]) urlMap[k] = v;
    }
  }
  const order = { '4k': 0, '2k': 1, 高清: 2, 蓝光: 3, 超清: 4, 标清: 5 };
  const arr = [];
  for (const q of Object.keys(urlMap).sort((a, b) => (order[a] !== undefined ? order[a] : 999) - (order[b] !== undefined ? order[b] : 999))) {
    arr.push(q, urlMap[q]);
  }
  return { parse: 0, jx: 0, url: arr.length ? arr : idv };
}

// 河马
async function playHema(ctx, idv) {
  const parts = idv.split('@');
  const body = hemaEnc(JSON.stringify({ bookId: parts[0], chapterIds: [parts[1]], unClockType: 'load', chapterId: parts.length > 2 ? parts[2] : '', resolutionRate: '720P' }));
  const res = safeJson(await http(ctx, RULES.河马.host + RULES.河马.play, { method: 'POST', headers: HEADERS.hema, body }));
  try {
    const d = safeJson(hemaDec(res.data || ''));
    const url = ((((d.chapterInfo || [{}])[0].content) || {}).mp4SwitchUrl || [idv])[0];
    return { parse: 0, jx: 0, url, header: HEADERS.hema };
  } catch (e) {
    return { parse: 0, jx: 0, url: idv };
  }
}

// 牛牛（含广告解锁）
async function playNiuniu(ctx, idv) {
  const arr = idv.split('+');
  if (arr.length === 2) {
    const em = arr[0].match(/\d+/);
    const ep = em ? em[0] : '';
    const res = safeJson(await http(ctx, RULES.牛牛.host + '/api/v1/app/play/movieDetails', {
      method: 'POST', headers: nnHeaders(ctx),
      body: JSON.stringify({ id: arr[1], source: 0, typeId: 'S1', userId: '546932', episodeId: ep }),
      timeout: 15000,
    }));
    if (res.code === 200 && (res.data || {}).url) return { parse: 0, jx: 0, url: res.data.url };
  } else if (arr.length === 3) {
    const index = arr[0];
    const lockType = arr[1];
    const thirdPlayId = arr[2];
    if (lockType === 'free') {
      const data1 = 'not_include=0&lock_free=1&type=1&clientVersion=v5.2.5&uuid=6IDYUSASPQY5BBVACWQW3LLTPV4V7DE26UOCX5TZTVUGX4VUJNXQ01&resolution=1080*2320&openudid=82f4175d577a2939&dt=22021211RC&os_api=31&install_id=1496879012031075&sdk_version=1.1.3.0&siteid=5627189&dev_log_aid=667431&oaid=abec0dfff623201b&timestamp=1752498494&direction=0&ac=mobile&os=Android&vod_version=1.10.21.6-tob&os_version=12&count=1&index=1&shortplay_id=' + String(thirdPlayId) + '&sha1=46121F77CE2FCAD3DBC3B9EC8A24908C1A8AD6D9&device_brand=Redmi&package_name=com.niuniu.ztdh.app';
      const fr = await niuniuPost(ctx, RULES.牛牛.detail2, data1, index);
      const lst = (fr.data || {}).list || [];
      if (lst.length) {
        const u = ((((lst[0].video_model || {}).video_list || {}).video_1) || {}).main_url;
        if (u) return { parse: 0, jx: 0, url: base64Decode(u) };
      }
    } else {
      const uld = 'ac=mobile&os=Android&vod_version=1.10.21.6-tob&os_version=12&lock_ad=3&lock_free=3&type=1&clientVersion=v5.2.5&uuid=6IDYUSASPQY5BBVACWQW3LLTPV4V7DE26UOCX5TZTVUGX4VUJNXQ01&resolution=1080*2320&openudid=82f4175d577a2939&shortplay_id=' + String(thirdPlayId) + '&dt=22021211RC&sha1=46121F77CE2FCAD3DBC3B9EC8A24908C1A8AD6D9&lock_index=21&os_api=31&install_id=1496879012031075&device_brand=Redmi&sdk_version=1.1.3.0&package_name=com.niuniu.ztdh.app&siteid=5627189&dev_log_aid=667431&oaid=abec0dfff623201b&timestamp=1752498493';
      await niuniuPost(ctx, RULES.牛牛.unlock, uld, index);
      const ud = 'not_include=0&lock_free=1&type=1&clientVersion=v5.2.5&uuid=6IDYUSASPQY5BBVACWQW3LLTPV4V7DE26UOCX5TZTVUGX4VUJNXQ01&resolution=1080*2320&openudid=82f4175d577a2939&dt=22021211RC&os_api=31&install_id=1496879012031075&sdk_version=1.1.3.0&siteid=5627189&dev_log_aid=667431&oaid=abec0dfff623201b&timestamp=1752498494&direction=0&ac=mobile&os=Android&vod_version=1.10.21.6-tob&os_version=12&count=1&index=1&shortplay_id=' + String(thirdPlayId) + '&sha1=46121F77CE2FCAD3DBC3B9EC8A24908C1A8AD6D9&device_brand=Redmi&package_name=com.niuniu.ztdh.app';
      const un = await niuniuPost(ctx, RULES.牛牛.detail2, ud, index);
      const lst = (un.data || {}).list || [];
      if (lst.length) {
        const u = ((((lst[0].video_model || {}).video_list || {}).video_1) || {}).main_url;
        if (u) return { parse: 0, jx: 0, url: base64Decode(u) };
      }
    }
  }
  return { parse: 0, jx: 0, url: idv };
}

// 爽爽
async function playShuangshuang(ctx, idv) {
  let pu = idv;
  if (!pu.startsWith('http')) {
    const up = idv.split('@');
    pu = up.length > 1 ? up[1] : idv;
    if (!pu.startsWith('http')) pu = RULES.爽爽.host + pu;
  }
  const html = await http(ctx, pu, { headers: { 'User-Agent': MOBILE_UA } });
  const m = html.match(/var player_[a-zA-Z0-9]+=(.*?)</) || html.match(/player_[a-zA-Z0-9]+=(.*?)</) || html.match(/({"flag":"play".*?})/);
  if (m) {
    let pd = {};
    try { pd = JSON.parse(m[1]); } catch (e) { pd = {}; }
    let vu = pd.url;
    if (String(pd.encrypt) === '1') vu = decodeURIComponent(vu);
    else if (String(pd.encrypt) === '2') {
      vu = base64Decode(vu);
      if (vu.indexOf('%') >= 0) vu = decodeURIComponent(vu);
    }
    if (vu && vu.startsWith('http')) return { parse: 0, jx: 0, url: vu };
  }
  const vt = html.match(/<video[^>]*src=["']([^"']+)["']/i) || html.match(/<source[^>]*src=["']([^"']+)["']/i);
  if (vt) return { parse: 0, jx: 0, url: vt[1] };
  return { parse: 0, jx: 0, url: idv };
}

// 喜福（阿里云 VOD STS 取播放地址）
async function playXifu(ctx, idv) {
  const dp = idv.split('@');
  const aid = dp[0];
  const seq = dp.length > 1 ? dp[1] : '';
  const ar = safeJson(await http(ctx, `${RULES.喜福.host}${RULES.喜福.playAuth}?albumId=${aid}&seq=${seq}`, { headers: HEADERS.web }));
  if (!ar.data) return null;
  const vid = ar.data.vid;
  let cred = {};
  try { cred = JSON.parse(base64Decode(ar.data.playAuth)); } catch (e) { return null; }
  const ts = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const params = {
    Action: 'GetPlayInfo', Version: '2017-03-21', Format: 'JSON',
    AccessKeyId: cred.AccessKeyId, SecurityToken: cred.SecurityToken,
    VideoId: vid, AuthInfo: cred.AuthInfo || '', Timestamp: ts,
    SignatureMethod: 'HMAC-SHA1', SignatureVersion: '1.0', SignatureNonce: uuidV4(),
  };
  if (cred.PlayConfig) params.PlayConfig = JSON.stringify(cred.PlayConfig);
  const cqs = Object.keys(params).sort().map((k) => `${rfc3986(k)}=${rfc3986(String(params[k]))}`).join('&');
  const sts = `GET&%2F&${rfc3986(cqs)}`;
  const sig = CryptoJS.HmacSHA1(sts, (cred.AccessKeySecret || '') + '&').toString(CryptoJS.enc.Base64);
  const fu = `https://vod.${cred.Region || 'cn-shanghai'}.aliyuncs.com/?${cqs}&Signature=${rfc3986(sig)}`;
  const vr = safeJson(await http(ctx, fu, { headers: { Accept: '*/*', Origin: 'https://minidrama.contentchina.com', Referer: 'https://minidrama.contentchina.com/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }));
  if (vr.PlayInfoList && vr.PlayInfoList.PlayInfo && vr.PlayInfoList.PlayInfo.length) {
    return { parse: 0, jx: 0, url: vr.PlayInfoList.PlayInfo[0].PlayURL };
  }
  return null;
}

// ---------------------------- dr3 源主体 ----------------------------
export default {
  meta: {
    title: '聚合短剧',
    host: 'https://djw123.com',
    searchable: 2,
    filterable: 1,
    quickSearch: 0,
    multi: 1,
  },
  rule: {
    host: 'https://djw123.com',
    headers: { 'User-Agent': DEF_UA },
    timeout: 10000,
    class_name: '河马短剧&七猫短剧&星芽短剧&百度短剧&山海短剧&薏米短剧&牛牛短剧&围观短剧&西饭短剧&好看短剧&喜福短剧&星星短剧&爽爽短剧&五五短剧',
    class_url: '河马&七猫&星芽&百度&山海&薏米&牛牛&围观&西饭&好看&喜福&星星&爽爽&五五',
  },

  // 初始化：星芽登录 / 牛牛 token / 山海 token / 喜福分类
  async init(ctx, ext) {
    log('【聚合短剧】初始化开始');

    // 星芽
    try {
      const r = safeJson(await http(ctx, RULES.星芽.login, {
        method: 'POST',
        headers: { 'User-Agent': DEF_UA, platform: '1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ device: '24250683a3bdb3f118dff25ba4b1cba1a' }),
      }));
      const d = r.data || {};
      const token = d.token || r.token || r.access_token || '';
      const h = { 'User-Agent': DEF_UA, 'Content-Type': 'application/json' };
      if (token) h.authorization = token;
      ctx.store.set('xy_h', h);
    } catch (e) {
      ctx.store.set('xy_h', { 'User-Agent': DEF_UA, 'Content-Type': 'application/json' });
    }

    // 牛牛
    const nnDeviceId = uuidV4();
    try {
      const tkhtml = safeJson(await http(ctx, RULES.牛牛.host + RULES.牛牛.visitor, {
        headers: { deviceid: nnDeviceId, token: '', 'User-Agent': 'okhttp/4.12.0', client: 'app', devicetype: 'Android' },
        timeout: 15000,
      }));
      ctx.store.set('nn_token', (((tkhtml.data || {}).token) || ''));
    } catch (e) {
      ctx.store.set('nn_token', '');
    }
    ctx.store.set('nn_h', Object.assign({}, HEADERS.niuniu, { token: ctx.store.get('nn_token', ''), deviceid: nnDeviceId }));

    try {
      const t = String(Math.floor(Date.now() / 1000));
      const body = `ac=wifi&os=Android&vod_version=1.10.21.6-tob&os_version=9&type=1&clientVersion=v5.2.5&uuid=Y4WNZ3SAWK7MAJMH7CXCDHJ4VMPVFRZQTBSIA4XTYO4AWEUHIK6Q01&resolution=1280*2618&openudid=889edced38f1069b&dt=Pixel%204&sha1=46121F77CE2FCAD3DBC3B9EC8A24908C1A8AD6D9&os_api=28&install_id=1549688030634536&device_brand=google&sdk_version=1.1.3.0&package_name=com.niuniu.ztdh.app&siteid=5627189&dev_log_aid=667431&oaid=&timestamp=${t}`;
      const nonce = 'VX1KKGtoBDCi1fB1';
      const signature = hmac256Hex(t + nonce + body, 'aceaa47f96b4875d446b2e1d97e03bbb');
      const encbody = aesEncECB(body, 'dafdb3d2a5c343d6');
      const loginpost = await http(ctx, RULES.牛牛.login, {
        method: 'POST',
        headers: { 'X-Salt': '786774955F', 'X-Nonce': nonce, 'X-Timestamp': t, 'X-Signature': signature, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: encbody,
      });
      if (loginpost) {
        const dec = safeJson(aesDecECB(loginpost, 'dafdb3d2a5c343d6'));
        ctx.store.set('nn_at', (((dec.data || {}).access_token) || ''));
      }
    } catch (e) {
      log('牛牛广告解锁模块加载失败');
    }

    // 山海
    await shanhaiauth(ctx);

    // 喜福
    try {
      const cd = safeJson(await http(ctx, `${RULES.喜福.host}${RULES.喜福.list}`, { headers: HEADERS.web }));
      const cats = (cd.data || {}).categories || [];
      ctx.store.set('xf_cats', cats.map((c) => ({ id: c.id, name: `精彩${c.name}` })));
    } catch (e) {
      log(`【喜福初始化异常】${e && e.message ? e.message : e}`);
    }
    return true;
  },

  // 首页分类 + 筛选（喜福筛选动态）
  async home(ctx, filter) {
    const classes = PLATFORMS.map((x) => ({ type_id: x.id, type_name: x.name }));
    const filters = JSON.parse(JSON.stringify(FILTERS));
    const cats = [{ n: '全部', v: '' }];
    for (const c of ctx.store.get('xf_cats', [])) cats.push({ n: c.name, v: String(c.id) });
    filters['喜福'] = [fv('area', '分类', cats.map((c) => [c.n, c.v]))];
    return { class: classes, filters };
  },

  // 分类列表
  async category(ctx, tid, pg, filter, extend) {
    const page = parseInt(pg, 10) || 1;
    const ext = extend && typeof extend === 'object' ? extend : {};
    let area = ext.area || '';
    if (!area) area = DEFAULT_AREA[tid] || '';
    const p = RULES[tid] || {};
    const fn = CAT_DISPATCH[tid];
    let videos = [];
    if (fn) {
      try {
        videos = await fn(ctx, p, area, page);
      } catch (e) {
        log(`【分类异常】${tid} p${page}: ${e && e.message ? e.message : e}`);
      }
    }
    videos = dedup(videos);
    return { list: videos, page, pagecount: page + 1, limit: videos.length, total: videos.length * (page + 1) };
  },

  // 详情
  async detail(ctx, id, fullId) {
    const idv = String(fullId || id || '');
    const dp = idv.split('@');
    const platform = dp[0];
    const did = dp.length > 1 ? dp.slice(1).join('@') : '';
    const p = RULES[platform] || {};
    const vod = { vod_id: idv, vod_name: '', vod_play_from: platform + '专线', vod_play_url: '暂无播放地址$0' };
    const fn = DET_DISPATCH[platform];
    if (fn) {
      try {
        Object.assign(vod, await fn(ctx, p, did));
      } catch (e) {
        log(`【详情异常】${idv}: ${e && e.message ? e.message : e}`);
      }
    }
    return { list: [vod] };
  },

  // 播放
  async play(ctx, flag, id, flags) {
    const idv = String(id || '');
    try {
      if (flag.indexOf('五五') >= 0 || idv.indexOf('duanju55.com') >= 0) {
        return await playWuwu(ctx, idv);
      }
      if (/好看|百度/.test(flag || '')) {
        return await playBaiduHaokan(ctx, flag || '', idv);
      }
      if (flag.indexOf('河马') >= 0) {
        return await playHema(ctx, idv);
      }
      if (flag.indexOf('牛牛') >= 0) {
        return await playNiuniu(ctx, idv);
      }
      if (flag.indexOf('爽爽') >= 0 || idv.indexOf('djw123.com') >= 0) {
        return await playShuangshuang(ctx, idv);
      }
      if (flag.indexOf('喜福') >= 0) {
        const r = await playXifu(ctx, idv);
        if (r) return r;
      }
    } catch (e) {
      log(`【播放异常】${flag} ${idv}: ${e && e.message ? e.message : e}`);
    }
    return { parse: 0, jx: 0, url: idv };
  },

  // 聚合搜索（并发各平台，星星/喜福无搜索）
  async search(ctx, wd, quick, pg) {
    const page = parseInt(pg, 10) || 1;
    const ids = ['河马', '七猫', '百度', '牛牛', '围观', '西饭', '好看', '星芽', '山海', '薏米', '爽爽', '五五'];
    const tasks = ids.map((sid) => {
      const fn = SEA_DISPATCH[sid];
      if (!fn) return Promise.resolve([]);
      return fn(ctx, RULES[sid], wd, page).catch((e) => {
        log(`【搜索单站异常】${sid}: ${e && e.message ? e.message : e}`);
        return [];
      });
    });
    const results = await ctx.all(tasks);
    const list = [];
    for (const r of results) {
      for (const x of r || []) list.push(x);
    }
    const out = dedup(list);
    return { list: out, page, pagecount: page + 1, limit: out.length, total: out.length * (page + 1) };
  },
};
