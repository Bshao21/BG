# -*- coding: utf-8 -*-
"""
=================================================
  袋鼠影视 TVBox / OK影视 / 影视仓 标准 Python 源
  站点: https://dsystv.com (袋鼠影视)
  仅供测试，测试完毕请于24小时删除。
=================================================

  修复说明（v2）：
  1. 播放列表改为按"线路"解析（苹果CMS·海螺模板）：
     详情页每个 <div class="panel" data-playlist-name=... data-playlist-line=...>
     内有该线路的分集 <li><a href="/play/xxx.html">集名</a></li>；
     详情页未预载分集时，请求 /playlist.php?id=&line= 接口兜底。
     修复前会把线路入口/按钮误当分集，导致播放列表错乱、播几秒被切走。
2. playerContent 改为优先从播放页提取真实 m3u8 直链 (var now="...")，
      以 parse:0 直接播放，绕开播放页的 web-player-auto-switch.js 自动跳集脚本。
  修复说明（v3）：
  3. 修复封面图加载（vod_pic）：
     a. 列表/搜索页懒加载卡片 <img src="占位图" data-original="真实图"> 原先会取到
        load.gif 占位图导致封面显示不出；改为优先 data-original 并过滤占位图；
     b. 详情页封面优先取 og:image 与主海报，不再误取"相关推荐"区的图；
     c. 清理图片 URL 中显式 :443/:80 端口，提升旧版播放器兼容性。
"""

import sys
import json
import re
import time
from urllib.parse import quote, urlencode

sys.path.append('..')

try:
    from base.spider import Spider
except ImportError:
    import requests as rq
    class Spider:
        def fetch(self, url, headers=None, **kw):
            kw.pop('timeout', None)
            r = rq.get(url, headers=headers, timeout=15, **kw)
            r.encoding = 'utf-8'
            return r


class Spider(Spider):
    """袋鼠影视 Spider - 苹果CMS架构 HTML解析"""

    host = 'https://dsystv.com'

    header = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': 'https://dsystv.com/',
    }

    # 分类列表（根据导航栏 /frim/index1.html 等推断）
    classes = [
        {'type_name': '电影', 'type_id': '1'},
        {'type_name': '电视剧', 'type_id': '2'},
        {'type_name': '动漫', 'type_id': '3'},
        {'type_name': '综艺', 'type_id': '4'},
    ]

    # ===================================================================
    #  基础方法
    # ===================================================================

    def getName(self):
        return '袋鼠影视'

    def init(self, extend=''):
        self.extend = extend or ''
        self._url_cache = {}

    def isVideoFormat(self, url):
        return any(x in url for x in ['.m3u8', '.mp4', '.flv'])

    def manualVideoCheck(self):
        return False

    def destroy(self):
        pass

    # ===================================================================
    #  请求封装
    # ===================================================================

    def _fetch_html(self, path):
        """获取页面 HTML"""
        url = path if path.startswith('http') else self.host + path
        try:
            r = self.fetch(url, headers=self.header, timeout=15)
            return r.text if hasattr(r, 'text') else r.content.decode('utf-8', errors='ignore')
        except Exception as e:
            return ''

    # ===================================================================
    #  图片处理
    # ===================================================================

    # 懒加载占位图特征：src 命中则说明真实图在 data-original
    _placeholder_pic_keys = ('load.gif', 'load.png', 'loading.gif', 'loading.png', 'lazy.gif', 'placeholder', '/images/')

    def _wrap_pic(self, pic_url):
        """处理图片URL，补全协议并清理显式默认端口"""
        if not pic_url:
            return ''
        pic_url = pic_url.strip()
        if pic_url.startswith('//'):
            pic_url = 'https:' + pic_url
        elif pic_url.startswith('/'):
            pic_url = self.host + pic_url
        # 清理显式默认端口（https:443 / http:80），提升旧版播放器兼容性
        pic_url = re.sub(r'^https://([^/]+):443(?=[/?:]|$)', r'https://\1', pic_url)
        pic_url = re.sub(r'^http://([^/]+):80(?=[/?:]|$)', r'http://\1', pic_url)
        return pic_url

    def _is_placeholder_pic(self, pic_url):
        """判断 URL 是否为懒加载占位图（真实图需从 data-original 获取）"""
        if not pic_url:
            return True
        u = pic_url.strip().lower()
        return any(k in u for k in self._placeholder_pic_keys)

    def _extract_card_pic(self, seg):
        """从卡片 a 标签内部片段提取真实封面：优先懒加载 data-original，其次 src，过滤占位图"""
        if not seg:
            return ''
        # 1) 懒加载真实地址 data-original
        mo = re.search(r'<img[^>]*data-original="([^"]+)"', seg, re.S)
        if mo and not self._is_placeholder_pic(mo.group(1)):
            return self._wrap_pic(mo.group(1))
        # 2) 直接 src
        ms = re.search(r'<img[^>]*src="([^"]+)"', seg, re.S)
        if ms and not self._is_placeholder_pic(ms.group(1)):
            return self._wrap_pic(ms.group(1))
        # 3) 卡片背景图兜底
        mbg = re.search(r'background(?:-image)?\s*:\s*url\(["\']?([^"\')\s]+)', seg, re.I)
        if mbg and not self._is_placeholder_pic(mbg.group(1)):
            return self._wrap_pic(mbg.group(1))
        return ''

    # ===================================================================
    #  首页 & 分类
    # ===================================================================

    def homeContent(self, filter):
        """首页：返回分类和筛选器（本站无筛选器，返回空）"""
        return {'class': self.classes, 'filters': {}}

    def homeVideoContent(self):
        """首页推荐视频"""
        try:
            html = self._fetch_html('/')
            vod_list = self._parse_video_list(html)
            return {'list': vod_list[:30]}
        except Exception:
            return {'list': []}

    def categoryContent(self, tid, pg, filter, extend):
        """分类内容：/frim/index{tid}.html?page={pg}"""
        try:
            pg = int(pg or 1)
            # 袋鼠影视分类页格式: /frim/index1.html (电影), index2.html (电视剧) ...
            url = f'/frim/index{tid}.html'
            if pg > 1:
                url += f'?page={pg}'
            html = self._fetch_html(url)
            vod_list = self._parse_video_list(html)
            pagecount = self._parse_pagecount(html)
            return {
                'page': pg,
                'pagecount': pagecount,
                'limit': len(vod_list),
                'total': pagecount * 24 if pagecount < 999 else 99999,
                'list': vod_list,
            }
        except Exception:
            return {'page': pg, 'pagecount': 1, 'limit': 0, 'total': 0, 'list': []}

    # ===================================================================
    #  搜索
    # ===================================================================

    def searchContent(self, key, quick, pg=1):
        """搜索：/search.php?searchword={key}&page={pg}"""
        try:
            pg = int(pg or 1)
            params = {'searchword': key}
            if pg > 1:
                params['page'] = pg
            url = '/search.php?' + urlencode(params)
            html = self._fetch_html(url)
            vod_list = self._parse_search_results(html)
            return {'list': vod_list[:30], 'page': pg}
        except Exception:
            return {'list': [], 'page': 1}

    def searchContentPage(self, key, quick, pg=1):
        return self.searchContent(key, quick, pg)

    # ===================================================================
    #  详情页
    # ===================================================================

    def detailContent(self, ids):
        """详情页：/movie/index{id}.html"""
        try:
            vod_id = ids[0] if isinstance(ids, list) else str(ids)
            html = self._fetch_html(f'/movie/index{vod_id}.html')

            # 标题
            vod_name = ''
            title_match = re.search(r'<h1[^>]*>(.*?)</h1>', html, re.S)
            if title_match:
                vod_name = re.sub(r'<[^>]+>', '', title_match.group(1)).strip()
            if not vod_name:
                title_match = re.search(r'<title>(.*?)</title>', html, re.S)
                if title_match:
                    vod_name = title_match.group(1).strip()
                    # 《剧名》全集在线观看 - 类型 | 袋鼠影视  -> 剧名
                    m = re.search(r'《([^》]+)》', vod_name)
                    if m:
                        vod_name = m.group(1)
                    else:
                        vod_name = re.split(r'\s*[-|]\s*', vod_name)[0]
                        vod_name = vod_name.replace('全集在线观看', '').strip()

            # 封面：og:image -> 主海报 -> 页面任意图，逐级兜底并过滤占位图
            vod_pic = ''
            og_match = re.search(r'<meta[^>]*property=["\']og:image["\'][^>]*content=["\']([^"\']+)', html, re.I)
            if not og_match:
                og_match = re.search(r'<meta[^>]*content=["\']([^"\']+)["\'][^>]*property=["\']og:image["\']', html, re.I)
            if og_match and not self._is_placeholder_pic(og_match.group(1)):
                vod_pic = og_match.group(1)
            if self._is_placeholder_pic(vod_pic):
                pm = re.search(r'<a[^>]*class="[^"]*videopic[^"]*"[^>]*href="/play/[^"]*"[^>]*>(.*?)</a>', html, re.S)
                if pm:
                    pic_match = re.search(r'<img[^>]*data-original="([^"]+)"', pm.group(1), re.S)
                    if not pic_match:
                        pic_match = re.search(r'<img[^>]*src="([^"]+)"', pm.group(1), re.S)
                    if pic_match and not self._is_placeholder_pic(pic_match.group(1)):
                        vod_pic = pic_match.group(1)
            if self._is_placeholder_pic(vod_pic):
                pic_match = re.search(r'data-original="([^"]+)"', html, re.S)
                if pic_match and not self._is_placeholder_pic(pic_match.group(1)):
                    vod_pic = pic_match.group(1)
            if self._is_placeholder_pic(vod_pic):
                pic_match = re.search(r'<img[^>]*src="([^"]+)"', html, re.S)
                if pic_match and not self._is_placeholder_pic(pic_match.group(1)):
                    vod_pic = pic_match.group(1)
            vod_pic = self._wrap_pic(vod_pic)

            # 详情信息 (苹果CMS常见结构)
            vod_year = ''
            vod_area = ''
            vod_class = ''
            vod_director = ''
            vod_actor = ''
            vod_content = ''

            # 提取详情列表
            info_items = re.findall(
                r'<li[^>]*>(?:<span[^>]*>)?(?:<i[^>]*>)?(.*?)(?:</i>)?(?:</span>)?：?\s*(.*?)</li>',
                html, re.S
            )
            for label, value in info_items:
                label = re.sub(r'<[^>]+>', '', label).strip()
                value = re.sub(r'<[^>]+>', '', value).strip()
                if '导演' in label:
                    vod_director = value
                elif '主演' in label:
                    vod_actor = value
                elif '类型' in label:
                    vod_class = value
                elif '地区' in label:
                    vod_area = value
                elif '年份' in label or '上映' in label:
                    year_m = re.search(r'(20\d{2})', value)
                    if year_m:
                        vod_year = year_m.group(1)

            # 简介
            desc_match = re.search(r'<div[^>]*data-video-plot\s*>(.*?)</div>', html, re.S)
            if desc_match:
                vod_content = re.sub(r'<[^>]+>', '', desc_match.group(1)).strip()
            if not vod_content:
                desc_match = re.search(r'<meta\s+name="description"\s+content="([^"]*)"', html)
                if desc_match:
                    vod_content = desc_match.group(1)

            # 播放地址 - 按"线路"解析分集列表
            play_from_list, play_url_list = self._parse_play_sources(html, vod_id)

            # 如果还没有，用当前页面兜底
            if not play_from_list:
                play_from_list.append('袋鼠影视')
                play_url_list.append(f'播放$/movie/index{vod_id}.html')

            vod = {
                'vod_id': vod_id,
                'vod_name': vod_name,
                'vod_pic': vod_pic,
                'type_name': vod_class or '袋鼠影视',
                'vod_year': vod_year,
                'vod_area': vod_area,
                'vod_actor': vod_actor,
                'vod_director': vod_director,
                'vod_content': vod_content,
                'vod_remarks': '',
                'vod_play_from': '$$$'.join(play_from_list),
                'vod_play_url': '$$$'.join(play_url_list),
            }
            return {'list': [vod]}
        except Exception:
            return {'list': []}

    # ===================================================================
    #  播放
    # ===================================================================

    def playerContent(self, flag, id, vipFlags):
        """播放：优先从播放页提取真实 m3u8 直链，避免网页解析器自动跳集"""
        try:
            play_url = str(id or '')
            # 补全播放页 URL
            if play_url.startswith('/'):
                page_url = self.host + play_url
            elif play_url.startswith('http'):
                page_url = play_url
            else:
                # 可能是纯ID，构造播放页
                page_url = self.host + f'/movie/index{play_url}.html'

            # 直链优先：播放页里 var now="...m3u8" 即本集真实地址
            m3u8 = self._get_direct_url(page_url)
            if m3u8:
                return {
                    'parse': 0,  # 直接播放直链，不经过网页解析器
                    'url': m3u8,
                    'header': {
                        'User-Agent': self.header['User-Agent'],
                        'Referer': self.host + '/',
                    },
                }

            # 兜底：使用播放器内置解析
            return {
                'parse': 1,
                'url': page_url,
                'header': {
                    'User-Agent': self.header['User-Agent'],
                    'Referer': self.host + '/',
                },
            }
        except Exception:
            return {}

    # ===================================================================
    #  本地代理 (图片代理 - 备用)
    # ===================================================================

    def localProxy(self, param):
        try:
            if isinstance(param, str):
                from urllib.parse import parse_qs
                param_dict = parse_qs(param)
            else:
                param_dict = param

            do = param_dict.get('do', '')
            if isinstance(do, list):
                do = do[0] if do else ''

            if do == 'img':
                url = param_dict.get('url', '')
                if isinstance(url, list):
                    url = url[0] if url else ''
                if url:
                    import base64
                    try:
                        url = base64.urlsafe_b64decode(url).decode('utf-8')
                    except Exception:
                        pass
                    if url:
                        headers = {
                            'User-Agent': self.header['User-Agent'],
                            'Referer': self.host + '/',
                        }
                        r = self.fetch(url, headers=headers, timeout=15)
                        content_type = 'image/jpeg'
                        if '.png' in url:
                            content_type = 'image/png'
                        elif '.webp' in url:
                            content_type = 'image/webp'
                        content = r.content if hasattr(r, 'content') else r.text.encode('utf-8')
                        return [200, content_type, content, {}]
        except Exception:
            pass
        return [404, 'text/plain', '', {}]

    # ===================================================================
    #  解析辅助方法
    # ===================================================================

    def _parse_play_sources(self, html, vod_id):
        """解析苹果CMS(海螺模板)多线路分集列表。

        详情页中每个线路是一个：
            <div class="panel clearfix" data-playlist-name="蓝光专线1" data-playlist-line="0" ...>
              <ul ...><li id="00"><a href="/play/{id}-{line}-{part}.html">第1集</a></li>...</ul>
            </div>
        返回 (from_list, url_list)，对应 vod_play_from / vod_play_url。
        """
        from_list, url_list = [], []

        panel_re = re.compile(
            r'<div[^>]*data-playlist-name="([^"]+)"[^>]*data-playlist-line="(\d+)"',
            re.S
        )
        hits = list(panel_re.finditer(html))

        for i, m in enumerate(hits):
            line_name = m.group(1).strip()
            line = m.group(2)
            seg_start = m.end()
            seg_end = hits[i + 1].start() if i + 1 < len(hits) else len(html)
            seg = html[seg_start:seg_end]

            eps = self._parse_episodes(seg)
            if not eps:
                # 详情页未预载该线路分集时，请求分集接口兜底
                eps = self._parse_episodes_from_api(vod_id, line)
            if not eps:
                continue

            from_list.append(line_name or f'线路{line}')
            url_list.append('#'.join(f'{name}${href}' for name, href in eps))

        return from_list, url_list

    def _parse_episodes(self, frag):
        """从分集片段中解析 (集名, 播放地址) 列表，去重保序"""
        if not frag:
            return []
        eps = []
        ep_re = re.compile(
            r'<li[^>]*>\s*<a[^>]*href="(/play/[^"]+\.html)"[^>]*>(.*?)</a>',
            re.S
        )
        for href, name in ep_re.findall(frag):
            clean_name = re.sub(r'<[^>]+>', '', name).strip()
            if not clean_name:
                clean_name = '播放'
            eps.append((clean_name, href))

        seen = set()
        out = []
        for name, href in eps:
            key = (name, href)
            if key in seen:
                continue
            seen.add(key)
            out.append((name, href))
        return out

    def _parse_episodes_from_api(self, vod_id, line):
        """通过分集接口 /playlist.php?id=&line= 获取分集（详情页未预载时兜底）"""
        try:
            url = '/playlist.php?' + urlencode({'id': vod_id, 'line': line})
            return self._parse_episodes(self._fetch_html(url))
        except Exception:
            return []

    def _get_direct_url(self, page_url):
        """带缓存的播放页直链提取，缓存 30 分钟"""
        now_t = time.time()
        cached = self._url_cache.get(page_url)
        if cached and now_t - cached[0] < 1800:
            return cached[1]
        html = self._fetch_html(page_url)
        m3u8 = self._find_m3u8(html)
        if m3u8:
            self._url_cache[page_url] = (now_t, m3u8)
        return m3u8

    def _find_m3u8(self, html):
        """从播放页中提取真实视频地址：优先 var now="..."，其次 player JSON，最后页面任意 m3u8"""
        if not html:
            return ''
        m = re.search(r'var\s+now\s*=\s*"([^"]+)"', html)
        if m:
            u = m.group(1).strip()
            if u.startswith('http'):
                return u
        m = re.search(r'var\s+player_[a-zA-Z0-9_]+\s*=\s*(\{.*?\})\s*;', html, re.S)
        if m:
            try:
                j = json.loads(m.group(1))
                u = str(j.get('url', '') or '')
                if u.startswith('http'):
                    return u
            except Exception:
                pass
        m = re.search(r'https?://[^"\'\s<>]+\.m3u8[^"\'\s<>]*', html)
        if m:
            return m.group(0)
        return ''

    def _parse_pagecount(self, html):
        """解析总页数"""
        try:
            # 匹配 "共X页" 或 "1/10" 格式
            m = re.search(r'共\s*(\d+)\s*页', html)
            if m:
                return int(m.group(1))
            m = re.search(r'/(\d+)\s*页', html)
            if m:
                return int(m.group(1))
            # 找最大页码
            nums = re.findall(r'[?&]page=(\d+)', html)
            if nums:
                return max(int(n) for n in nums)
            if '下一页' in html:
                return 999
        except Exception:
            pass
        return 1

    def _parse_video_list(self, html):
        """解析视频卡片列表（首页/分类页）"""
        vod_list = []
        seen = set()

        # 匹配视频卡片: <a class="videopic" href="/movie/indexXXX.html" title="标题">
        pattern = re.compile(
            r'<a[^>]*class="[^"]*videopic[^"]*"[^>]*href="(/movie/index(\d+)\.html)"[^>]*title="([^"]*)"',
            re.S
        )

        for m in pattern.finditer(html):
            href, vid, title = m.group(1), m.group(2), m.group(3)
            if vid in seen:
                continue
            seen.add(vid)

            # 卡片内容片段：从匹配结束位置到该 a 标签的 </a>
            seg_end = re.compile(r'</a>', re.S).search(html, m.end())
            seg = html[m.end(): seg_end.start()] if seg_end else ''

            # 提取图片（优先懒加载 data-original，过滤占位图）
            pic_url = self._extract_card_pic(seg)

            # 提取备注（评分/年份/集数），限定在卡片片段内，避免串到其他同名链接
            remark = ''
            rem_match = re.search(r'<span[^>]*class="[^"]*remark[^"]*"[^>]*>(.*?)</span>', seg, re.S)
            if rem_match:
                remark = re.sub(r'<[^>]+>', '', rem_match.group(1)).strip()
            if not remark:
                year_match = re.search(r'(20\d{2})', seg)
                if year_match:
                    remark = year_match.group(1)

            vod_list.append({
                'vod_id': vid,
                'vod_name': title,
                'vod_pic': pic_url,
                'vod_remarks': remark,
            })

        return vod_list

    def _parse_search_results(self, html):
        """解析搜索结果（卡片与列表同构，限定 videopic 避免误收排行/推荐链接）"""
        vod_list = []
        seen = set()

        pattern = re.compile(
            r'<a[^>]*class="[^"]*videopic[^"]*"[^>]*href="(/movie/index(\d+)\.html)"[^>]*title="([^"]*)"',
            re.S
        )

        for m in pattern.finditer(html):
            href, vid, title = m.group(1), m.group(2), m.group(3)
            if vid in seen:
                continue
            seen.add(vid)

            seg_end = re.compile(r'</a>', re.S).search(html, m.end())
            seg = html[m.end(): seg_end.start()] if seg_end else ''

            # 提取图片（优先懒加载 data-original，过滤占位图）
            pic_url = self._extract_card_pic(seg)

            vod_list.append({
                'vod_id': vid,
                'vod_name': title,
                'vod_pic': pic_url,
                'vod_remarks': '',
            })

        return vod_list