# -*- coding: utf-8 -*-
# TVBox爬虫 - 青禾影视 (tv.qhdaohang.cn)
# by：轻狂书生

import re
import json
import sys
import urllib3
from base.spider import Spider

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
sys.path.append('..')


class Spider(Spider):
    # ========== 基础配置 ==========
    host = 'https://tv.qhdaohang.cn'

    def_headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://tv.qhdaohang.cn/',
    }

    # 分类配置（一级分类 → 二级子分类）
    categories = {
        '20': {'name': '电影', 'subs': {
            '53': 'Netflix电影', '21': '动作片', '22': '喜剧片', '23': '爱情片',
            '24': '科幻片', '25': '恐怖片', '26': '剧情片', '27': '战争片',
            '28': '惊悚片', '29': '犯罪片', '30': '冒险篇', '31': '动画片',
            '32': '悬疑片', '33': '武侠片', '34': '奇幻片', '35': '纪录片', '36': '其他片',
        }},
        '37': {'name': '电视剧', 'subs': {
            '38': '国产剧', '39': '港台剧', '40': '欧美剧', '41': '日韩剧', '42': '海外剧',
        }},
        '56': {'name': '下饭剧', 'subs': {}},
        '43': {'name': '动漫', 'subs': {
            '48': '国产动漫', '49': '日本动漫', '50': '欧美动漫', '51': '其他动漫',
        }},
        '45': {'name': '综艺', 'subs': {}},
        '55': {'name': '短剧', 'subs': {}},
        '47': {'name': 'B站', 'subs': {}},
    }

    # 解析配置（from → parse 前缀）
    # 注意：svip.qlplayer.cyou 有反调试+CF防护，TVBox WebView 无法解析，已替换
    parse_map = {
        'youku': 'https://jx.xmflv.com/?url=',
        'qq': 'https://jx.77flv.cc/?url=',
        'qiyi': 'https://jx.xmflv.com/?url=',
        'mgtv': 'https://jx.77flv.cc/?url=',
        'bilibili': 'https://jx.xmflv.com/?url=',
        'smzy': 'https://jx.playerjy.com/?url=',
        'snm3u8': 'https://jx.xmflv.com/?url=',
        'yym3u8': 'https://jx.77flv.cc/?url=',
        'zuidam3u8': 'https://jx.xmflv.com/?url=',
        'huohua': 'https://jx.77flv.cc/?url=',
        'feifan': 'https://jx.playerjy.com/?url=',
        'dbm3u8': 'https://jx.xmflv.com/?url=',
        'nn': 'https://jx.xmflv.com/?url=',
    }

    # ========== 生命周期方法 ==========

    def init(self, extend=''):
        pass

    def getName(self):
        return '青禾影视'

    def isVideoFormat(self, url):
        pass

    def manualVideoCheck(self):
        pass

    def destroy(self):
        pass

    def localProxy(self, param):
        pass

    # ========== 核心方法 ==========

    def homeContent(self, filter):
        try:
            classes = []
            for tid, info in self.categories.items():
                cls = {
                    'type_id': tid,
                    'type_name': info['name'],
                }
                # 有子分类时添加筛选
                if info['subs']:
                    cls['type_flag'] = '1'
                classes.append(cls)

            filters = {}
            for tid, info in self.categories.items():
                if info['subs']:
                    filters[tid] = [
                        {
                            'key': 'cateId',
                            'name': '类型',
                            'value': [{'n': '全部', 'v': tid}] +
                                     [{'n': name, 'v': sid} for sid, name in info['subs'].items()]
                        }
                    ]

            result = {'class': classes}
            if filters:
                result['filters'] = filters
            return result
        except Exception:
            return {'class': []}

    def homeVideoContent(self):
        try:
            r = self.fetch(self.host + '/', headers=self.def_headers, verify=False)
            r.encoding = 'utf-8'
            html = r.text

            videos = self._extractList(html)
            return {'list': videos}
        except Exception:
            return {'list': []}

    def categoryContent(self, tid, pg, filter, extend):
        try:
            # 确定实际分类ID
            cate_id = extend.get('cateId', tid) if extend else tid

            # vodshow URL格式: /vodshow/{cateId}-{area}-{lang}-{year}-{order}---{page}.html
            # 分页从第2页开始
            if pg == '1':
                url = f'{self.host}/vodshow/{cate_id}-----------.html'
            else:
                url = f'{self.host}/vodshow/{cate_id}-----------{pg}.html'

            r = self.fetch(url, headers=self.def_headers, verify=False)
            r.encoding = 'utf-8'
            html = r.text

            videos = self._extractList(html)

            # 计算总页数
            pagecount = 1
            page_m = re.search(r'href="[^"]*vodshow/[^"]*?(\d+)\.html"[^>]*>[^<]*<[^>]*>[^<]*尾页', html)
            if not page_m:
                page_m = re.search(r'<a[^>]*>[^<]*尾页<', html)
                if page_m:
                    last_links = re.findall(r'href="(/vodshow/[^"]*?(\d+)\.html)"', html)
                    if last_links:
                        pagecount = max(int(p[1]) for p in last_links)

            return {'list': videos, 'page': int(pg), 'pagecount': pagecount, 'limit': 72}
        except Exception:
            return {'list': [], 'page': int(pg), 'pagecount': 1}

    def searchContent(self, key, quick, pg='1'):
        try:
            url = f'{self.host}/index.php/ajax/suggest?mid=1&wd={key}&page={pg}'
            r = self.fetch(url, headers=self.def_headers, verify=False)
            data = json.loads(r.text)

            videos = []
            for item in data.get('list', []):
                videos.append({
                    'vod_id': str(item['id']),
                    'vod_name': item['name'],
                    'vod_pic': item.get('pic', ''),
                    'vod_remarks': '',
                    'vod_content': '',
                })
            return {'list': videos, 'page': int(pg),
                    'pagecount': data.get('pagecount', 1),
                    'total': data.get('total', 0)}
        except Exception:
            return {'list': []}

    def detailContent(self, ids):
        try:
            # 兼容 ids 为字符串或列表
            raw = ids[0] if isinstance(ids, list) else ids
            vod_id = str(raw).split(',')[0].strip()
            url = f'{self.host}/voddetail/{vod_id}.html'
            r = self.fetch(url, headers=self.def_headers, verify=False)
            r.encoding = 'utf-8'
            html = r.text

            # 标题 - 从 this-desc-title（slide-desc-box 内）
            title_m = re.search(r'class="[^"]*this-desc-title[^"]*"[^>]*>(.*?)</div>', html, re.S)
            vod_name = re.sub(r'<[^>]+>', '', title_m.group(1)).strip() if title_m else ''
            if not vod_name:
                meta_m = re.search(r'<meta[^>]*name="description"[^>]*content="([^"]*)"', html)
                if meta_m:
                    vod_name = meta_m.group(1).split('剧情')[0].split('简介')[0].strip()

            # 图片 - 从 data-src（详情页预览图）
            pic_m = re.search(r'data-src="([^"]*(?:upload|dytt-img)[^"]*)"', html)
            if not pic_m:
                pic_m = re.search(r'<img[^>]*(?:data-original|data-src|src)="([^"]*(?:upload|cover)[^"]*)"', html)
            vod_pic = pic_m.group(1) if pic_m else ''

            # 简介
            vod_content = ''
            meta_m = re.search(r'<meta[^>]*name="description"[^>]*content="([^"]*)"', html)
            if meta_m:
                vod_content = meta_m.group(1).strip()
                # 清理前缀
                vod_content = re.sub(r'^.*?(?:剧情|简介)[：:]\s*', '', vod_content).strip()
                vod_content = re.sub(r'^.*?(?:在线|免费观看)[，,]?\s*', '', vod_content).strip()
            vod_content = '🌺【加🇶:793641910 防失联、获取最新软件】☞' + vod_content if vod_content else '【by：别叫偶兵哥哥】'

            # 播放源tabs
            source_names = []
            tab_m = re.search(r'class="[^"]*anthology-tab[^"]*"[^>]*>(.*?)</div>', html, re.S)
            if tab_m:
                for a in re.finditer(r'<a[^>]*>(.*?)</a>', tab_m.group(1), re.S):
                    text = re.sub(r'<[^>]+>', '', a.group(1)).strip()
                    # 去掉 &nbsp; 和 badge 数字
                    text = text.replace('&nbsp;', ' ').strip()
                    text = re.sub(r'\d+$', '', text).strip()
                    if text:
                        source_names.append(text)

            # 播放列表 - anthology-list-box
            vod_play_from = []
            vod_play_url = []
            boxes = list(re.finditer(
                r'class="[^"]*anthology-list-box[^"]*"[^>]*>(.*?)</ul>\s*</div>',
                html, re.S
            ))

            for i, box in enumerate(boxes):
                box_html = box.group(1)
                # 线路名
                if i < len(source_names):
                    src_name = source_names[i]
                else:
                    src_name = f'线路{i+1}'

                # 提取剧集
                episodes = []
                for a in re.finditer(r'<a[^>]*href="(/vodplay/[^"]*)"[^>]*>(.*?)</a>', box_html, re.S):
                    ep_name = re.sub(r'<[^>]+>', '', a.group(2)).strip()
                    ep_url = a.group(1)
                    episodes.append(f'{ep_name}${self.host}{ep_url}')

                if episodes:
                    vod_play_from.append(src_name)
                    vod_play_url.append('#'.join(episodes))

            # 如果没找到 anthology-list-box，尝试 anthology-list top20
            if not vod_play_from:
                list_m = re.search(
                    r'class="[^"]*anthology-list[^"]*"[^>]*>(.*?)</ul>',
                    html, re.S
                )
                if list_m:
                    episodes = []
                    for a in re.finditer(r'<a[^>]*href="(/vodplay/[^"]*)"[^>]*>(.*?)</a>', list_m.group(1), re.S):
                        ep_name = re.sub(r'<[^>]+>', '', a.group(2)).strip()
                        ep_url = a.group(1)
                        episodes.append(f'{ep_name}${self.host}{ep_url}')
                    if episodes:
                        src = source_names[0] if source_names else '默认'
                        vod_play_from.append(src)
                        vod_play_url.append('#'.join(episodes))

            video = {
                'vod_id': vod_id,
                'vod_name': vod_name,
                'vod_pic': vod_pic,
                'vod_content': vod_content,
                'vod_play_from': '$$$'.join(vod_play_from),
                'vod_play_url': '$$$'.join(vod_play_url),
            }

            return {'list': [video]}
        except Exception:
            return {'list': []}

    def playerContent(self, flag, vid, vip_flags):
        try:
            # vid = 完整播放页URL，如 https://tv.qhdaohang.cn/vodplay/148637-1-1.html
            # 从播放页提取 player_aaaa
            r = self.fetch(vid, headers=self.def_headers, verify=False)
            r.encoding = 'utf-8'

            player_m = re.search(r'player_aaaa\s*=\s*(\{.+?\})\s*</script>', r.text, re.S)
            if not player_m:
                return {'parse': 0, 'jx': 0, 'url': '', 'header': ''}

            data = json.loads(player_m.group(1))
            video_url = data.get('url', '')
            from_flag = data.get('from', '')

            jx = 0
            parse = 0
            final_url = video_url

            # m3u8/mp4 直链
            if '.m3u8' in video_url or '.mp4' in video_url:
                parse = 0
                jx = 0

            # dytt 自营线路 - 需要二次解析获取真实m3u8
            elif from_flag == 'dytt' and video_url.startswith('http'):
                real_url = self._parse_dytt(video_url)
                if real_url:
                    final_url = real_url
                    parse = 0
                    jx = 0
                else:
                    # 解析失败，交给TVBox外挂
                    jx = 1
                    parse = 1

            # 其他需解析的线路
            elif from_flag in self.parse_map:
                parse_prefix = self.parse_map[from_flag]
                final_url = parse_prefix + video_url
                parse = 1
                jx = 1

            else:
                # 未知格式，交给TVBox
                jx = 1
                parse = 1

            return {
                'parse': parse,
                'jx': jx,
                'url': final_url,
                'header': {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
                    'Referer': self.host + '/',
                }
            }
        except Exception:
            return {'parse': 0, 'jx': 0, 'url': '', 'header': ''}

    # ========== 辅助方法 ==========

    def _extractList(self, html):
        """从列表页HTML提取视频卡片"""
        videos = []
        seen_ids = set()

        # 卡片结构: <div class="public-list-box public-pic-b swiper-slide">
        #   <a class="public-list-exp" href="/vodplay/xxx-1-1.html" title="片名">
        #     <img class="lazy lazyload" data-src="图片" alt="片名">
        #   </a>
        for m in re.finditer(
            r'<a[^>]*class="[^"]*public-list-exp[^"]*"[^>]*href="(/vodplay/(\d+)-\d+-\d+\.html)"[^>]*title="([^"]*)"[^>]*>.*?'
            r'<img[^>]*data-src="([^"]*)"[^>]*>',
            html, re.S
        ):
            href, vid, title, pic = m.group(1), m.group(2), m.group(3), m.group(4)
            if vid in seen_ids:
                continue
            seen_ids.add(vid)

            # 备注
            remarks_m = re.search(
                r'</a>\s*<span[^>]*class="[^"]*public-list-prb[^"]*"[^>]*>(.*?)</span>',
                html[m.end():m.end() + 200], re.S
            )
            remarks = remarks_m.group(1).strip() if remarks_m else ''

            videos.append({
                'vod_id': vid,
                'vod_name': title,
                'vod_pic': pic,
                'vod_remarks': remarks,
                'vod_content': '',
            })

        return videos

    def _parse_dytt(self, share_url):
        """解析 dytt 自营线路，返回真实m3u8地址"""
        try:
            headers = {
                **self.def_headers,
                'Referer': self.host + '/',
            }
            r = self.fetch(share_url, headers=headers, verify=False)
            # 从JS中提取 url 变量值
            url_m = re.search(r'const\s+url\s*=\s*"([^"]+)"', r.text)
            if url_m:
                relative_url = url_m.group(1)
                # 从 share_url 提取域名
                from urllib.parse import urlparse
                domain = f'{urlparse(share_url).scheme}://{urlparse(share_url).netloc}'
                return domain + relative_url
        except Exception:
            pass
        return None
