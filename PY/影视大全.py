# -*- coding: utf-8 -*-

# TVBox爬虫 - 影视大全 (www.iysdq.tv)




import re

import json

import sys

import urllib3

from base.spider import Spider



urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

sys.path.append('..')





class Spider(Spider):

    # ========== 基础配置 ==========

    host = 'https://www.iysdq.tv'



    def_headers = {

        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',

        'Referer': 'https://www.iysdq.tv/',

    }



    # 分类配置

    categories = [

        {'type_id': '1', 'type_name': '电影'},

        {'type_id': '2', 'type_name': '电视剧'},

        {'type_id': '3', 'type_name': '综艺'},

        {'type_id': '4', 'type_name': '动漫'},

        {'type_id': '5', 'type_name': '短剧'},

    ]



    # ========== 生命周期方法 ==========



    def init(self, extend=''):

        pass



    def getName(self):

        return '影视大全'



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

            return {'class': self.categories}

        except Exception:

            return {'class': []}



    def homeVideoContent(self):

        try:

            r = self.fetch(self.host + '/', headers=self.def_headers, verify=False)

            r.encoding = 'utf-8'

            videos = self._extractList(r.text)

            return {'list': videos}

        except Exception:

            return {'list': []}



    def categoryContent(self, tid, pg, filter, extend):

        try:

            # 分页URL格式: /vodshow/{tid}--time------{pg}---.html

            url = f'{self.host}/vodshow/{tid}--time------{pg}---.html'

            r = self.fetch(url, headers=self.def_headers, verify=False)

            r.encoding = 'utf-8'

            videos = self._extractList(r.text)



            # 从 hl-total JS变量提取总数，计算总页数（每页40条）

            total = 0

            total_m = re.search(r"\$\(\'\.hl-total\'\)\.html\('(\d+)'\)", r.text)

            if total_m:

                total = int(total_m.group(1))

            pagecount = (total + 39) // 40 if total > 0 else int(pg) + 1



            return {

                'list': videos,

                'page': int(pg),

                'pagecount': pagecount,

                'limit': 40,

            }

        except Exception:

            return {'list': [], 'page': int(pg), 'pagecount': 1}



    def searchContent(self, key, quick, pg='1'):

        try:

            url = f'{self.host}/index.php/ajax/suggest?mid=1&wd={key}&page={pg}'

            r = self.fetch(url, headers=self.def_headers, verify=False)

            data = json.loads(r.text)



            videos = []

            for item in data.get('list', []):

                pic = item.get('pic', '')

                if pic and not pic.startswith('http'):

                    pic = self.host + pic



                videos.append({

                    'vod_id': str(item['id']),

                    'vod_name': item['name'],

                    'vod_pic': pic,

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



            # 标题

            vod_name = ''

            title_m = re.search(r'class="[^"]*this-desc-title[^"]*"[^>]*>(.*?)</', html, re.S)

            if title_m:

                vod_name = re.sub(r'<[^>]+>', '', title_m.group(1)).strip()

            if not vod_name:

                h1_m = re.search(r'<h1[^>]*>(.*?)</h1>', html, re.S)

                if h1_m:

                    vod_name = re.sub(r'<[^>]+>', '', h1_m.group(1)).strip()



            # 图片

            vod_pic = ''

            pic_m = re.search(r'data-src="([^"]*(?:upload|cover)[^"]*)"', html)

            if not pic_m:

                pic_m = re.search(r'<img[^>]*src="(https?://[^"]*(?:upload|cover|vod)[^"]*)"', html)



            # 简介

            vod_content = ''

            meta_m = re.search(r'<meta[^>]*name="description"[^>]*content="([^"]*)"', html)

            if meta_m:

                vod_content = meta_m.group(1).strip()

                vod_content = re.sub(r'^.*?(?:剧情|简介)[：:]\s*', '', vod_content).strip()

                vod_content = re.sub(r'^.*?(?:在线|免费观看)[，,]?\s*', '', vod_content).strip()

            vod_content = '🌺加🇶:793641910 获取最新软件☞' + vod_content if vod_content else '【by：别叫偶兵哥哥】'



            # 播放源tabs（swiper-slide 内的线路名）

            source_names = []

            tab_m = re.search(r'class="anthology-tab[^"]*"[^>]*>(.*?)</div>\s*</div>', html, re.S)

            if tab_m:

                for a in re.finditer(r'<a[^>]*class="swiper-slide"[^>]*>(.*?)</a>', tab_m.group(1), re.S):

                    text = re.sub(r'<[^>]+>', '', a.group(1)).strip()

                    text = text.replace('&nbsp;', ' ').strip()

                    # 去掉 badge 数字和图标

                    text = re.sub(r'(\d+)\s*$', '', text).strip()

                    # 过滤下载源

                    if text and '下载' not in text:

                        source_names.append(text)



            # 播放列表 - anthology-list-box（按顺序对应 tabs）

            vod_play_from = []

            vod_play_url = []

            boxes = list(re.finditer(

                r'class="[^"]*anthology-list-box[^"]*"[^>]*>(.*?)</ul>\s*</div>',

                html, re.S

            ))



            for i, box in enumerate(boxes):

                # 跳过下载源的列表（只取播放源对应的）

                if i >= len(source_names):

                    break



                src_name = source_names[i]

                box_html = box.group(1)



                # 提取剧集

                episodes = []

                for a in re.finditer(r'<a[^>]*href="(/vodplay/[^"]*)"[^>]*>(.*?)</a>', box_html, re.S):

                    ep_name = re.sub(r'<[^>]+>', '', a.group(2)).strip()

                    ep_url = a.group(1)

                    episodes.append(f'{ep_name}${self.host}{ep_url}')



                if episodes:

                    vod_play_from.append(src_name)

                    vod_play_url.append('#'.join(episodes))



            # 如果 anthology-list-box 没匹配到，尝试 anthology-list-play

            if not vod_play_from:

                list_m = re.search(

                    r'class="[^"]*anthology-list-play[^"]*"[^>]*>(.*?)</ul>',

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

                'vod_pic': pic_m.group(1) if pic_m else '',

                'vod_content': vod_content,

                'vod_play_from': '$$$'.join(vod_play_from),

                'vod_play_url': '$$$'.join(vod_play_url),

            }



            return {'list': [video]}

        except Exception:

            return {'list': []}



    def playerContent(self, flag, vid, vip_flags):

        try:

            # vid = 完整播放页URL，如 https://www.iysdq.tv/vodplay/142285-1-1.html

            r = self.fetch(vid, headers=self.def_headers, verify=False)

            r.encoding = 'utf-8'



            # 提取 player_aaaa

            player_m = re.search(r'player_aaaa\s*=\s*(\{.+?\})\s*</script>', r.text, re.S)

            if not player_m:

                player_m = re.search(r'player_aaaa\s*=\s*(\{.+?\})\s*;', r.text, re.S)

            if not player_m:

                return {'parse': 0, 'jx': 0, 'url': '', 'header': ''}



            data = json.loads(player_m.group(1))

            video_url = data.get('url', '')



            if not video_url:

                return {'parse': 0, 'jx': 0, 'url': '', 'header': ''}



            # 所有线路 ps=0，直接播放（m3u8/mp4 直链）

            return {

                'parse': 0,

                'jx': 0,

                'url': video_url,

                'header': {

                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',

                    'Referer': self.host + '/',

                }

            }

        except Exception:

            return {'parse': 0, 'jx': 0, 'url': '', 'header': ''}



    # ========== 辅助方法 ==========



    def _extractList(self, html):

        """从列表页HTML提取视频卡片（首页/分类页通用）"""

        videos = []

        seen_ids = set()



        # 卡片结构: <div class="public-list-box">

        #   <a class="public-list-exp" href="/voddetail/xxx.html" title="片名">

        #     <img class="lazy lazy1" data-src="图片" ...>

        #     <span class="public-list-prb">HD</span>

        #   </a>

        for m in re.finditer(

            r'<a[^>]*class="[^"]*public-list-exp[^"]*"[^>]*href="(/voddetail/(\d+)\.html)"[^>]*title="([^"]*)"[^>]*>',

            html

        ):

            href, vid, title = m.group(1), m.group(2), m.group(3)

            if vid in seen_ids:

                continue

            seen_ids.add(vid)



            # 向后查找图片和备注

            chunk = html[m.start():m.start() + 1500]



            # 图片 data-src

            pic_m = re.search(r'data-src="([^"]*)"', chunk)

            pic = pic_m.group(1) if pic_m else ''

            if pic and not pic.startswith('http'):

                pic = self.host + pic



            # 备注

            remarks_m = re.search(r'class="[^"]*public-list-prb[^"]*"[^>]*>(.*?)</span>', chunk, re.S)

            remarks = remarks_m.group(1).strip() if remarks_m else ''



            videos.append({

                'vod_id': vid,

                'vod_name': title,

                'vod_pic': pic,

                'vod_remarks': remarks,

                'vod_content': '',

            })



        return videos