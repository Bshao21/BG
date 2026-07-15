# coding=utf-8
import json
import urllib.request
import urllib.parse
from typing import Dict, List, Optional

class Spider:
    def __init__(self):
        self.extend = ""
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 16; 23113RKC6G Build/BP2A.250605.031.A3) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/151.0.7922.18 Mobile Safari/537.36',
            'Referer': 'https://h5.dramaplay.shop/'
        }
        self.base_url = "https://api.dramaplay.shop"

    def init(self, extend: str = "") -> None:
        if isinstance(extend, list) and len(extend) > 0:
            self.extend = str(extend[0])
        else:
            self.extend = str(extend)
        try:
            if self.extend.startswith('{'):
                config = json.loads(self.extend)
                if config.get('api_url'):
                    self.base_url = config.get('api_url')
            elif self.extend.startswith('http'):
                self.base_url = self.extend
        except Exception as e:
            print(f"[ERROR] 初始化失败: {e}")

    def getDependence(self):
        return []

    def _fetch(self, url: str) -> Optional[Dict]:
        try:
            req = urllib.request.Request(url, headers=self.headers)
            with urllib.request.urlopen(req, timeout=15) as response:
                if response.status != 200:
                    return None
                data = response.read().decode('utf-8')
                return json.loads(data)
        except Exception as e:
            print(f"[ERROR] 请求失败: {e}")
            return None

    def homeContent(self, filter: bool) -> Dict:
        """首页：只返回一个分类（全部），并返回推荐列表"""
        result = {'class': [{'type_id': '0', 'type_name': '全部'}], 'filters': {}, 'list': []}
        try:
            data = self._fetch(f"{self.base_url}/api/video/indexdata")
            if data:
                for item in data.get('listjq', [])[:20]:
                    result['list'].append({
                        'vod_id': str(item.get('id', '')),
                        'vod_name': item.get('name', '未知标题'),
                        'vod_pic': item.get('img', ''),
                        'vod_remarks': item.get('tp', ''),
                        'vod_content': item.get('story', '')[:100],
                    })
        except Exception as e:
            print(f"[ERROR] homeContent: {e}")
            return self._error_result(str(e))
        return result

    def homeVideoContent(self) -> Dict:
        return self.homeContent(False)

    def categoryContent(self, tid: str, pg: str, filter: bool, extend: Dict) -> Dict:
        """分类列表 - 使用 lists 接口分页，无视 tid 返回全部视频"""
        result = {'list': [], 'page': int(pg) if pg else 1, 'pagecount': 10, 'limit': 15, 'total': 0}
        try:
            page = int(pg) if pg else 1
            limit = 15
            offset = (page - 1) * limit
            
            url = f"{self.base_url}/api/video/lists?limit={limit}&offset={offset}"
            data = self._fetch(url)
            if not data:
                return self._error_result("列表获取失败")
            
            items = data.get('rows', [])
            result['total'] = data.get('total', 0)
            result['pagecount'] = (result['total'] + limit - 1) // limit
            
            for item in items:
                result['list'].append({
                    'vod_id': str(item.get('id', '')),
                    'vod_name': item.get('name', '未知标题'),
                    'vod_pic': item.get('img', ''),
                    'vod_remarks': item.get('tp', ''),
                    'vod_content': item.get('story', '')[:200],
                })
        except Exception as e:
            print(f"[ERROR] categoryContent: {e}")
            return self._error_result(str(e))
        return result

    def detailContent(self, ids: List[str]) -> Dict:
        result = {'list': []}
        try:
            vid = ids[0] if ids else '0'
            url = f"{self.base_url}/api/video/videoinfo?page=1&vid={vid}"
            data = self._fetch(url)
            if data:
                videodata = data.get('videodata', {})
                play_urls = []
                for item in data.get('data', []):
                    mid = item.get('mid', '')
                    name = item.get('name', f'第{item.get("id", "")}集')
                    if mid:
                        play_urls.append(f"{name}${mid}")
                
                if play_urls:
                    video = {
                        'vod_id': str(videodata.get('id', vid)),
                        'vod_name': videodata.get('name', ''),
                        'vod_pic': videodata.get('img', ''),
                        'vod_content': videodata.get('story', '') or videodata.get('info', ''),
                        'vod_remarks': videodata.get('tp', ''),
                        'vod_play_from': '线路1',
                        'vod_play_url': '#'.join(play_urls),
                    }
                    result['list'].append(video)
                    return result
        except Exception as e:
            print(f"[ERROR] detailContent: {e}")
        return {'list': []}

    def searchContent(self, key: str, quick: bool, pg: Optional[str] = None) -> Dict:
        result = {'list': []}
        try:
            if not key:
                return result
            page = int(pg) if pg else 1
            limit = 15
            offset = (page - 1) * limit
            url = f"{self.base_url}/api/video/lists?limit={limit}&offset={offset}&keytext={urllib.parse.quote(key)}"
            data = self._fetch(url)
            if data:
                for item in data.get('rows', []):
                    result['list'].append({
                        'vod_id': str(item.get('id', '')),
                        'vod_name': item.get('name', ''),
                        'vod_pic': item.get('img', ''),
                        'vod_remarks': item.get('tp', ''),
                        'vod_content': item.get('story', '')[:200],
                    })
        except Exception as e:
            print(f"[ERROR] searchContent: {e}")
        return result

    def playerContent(self, flag: str, id: str, vipFlags: Optional[Dict] = None) -> Dict:
        if id:
            play_url = f"https://sgcdn.hdou.tv/video/{id}/output.m3u8"
            return {'parse': 0, 'url': play_url}
        return {'parse': 0, 'url': ''}

    def localProxy(self, param: Optional[Dict]) -> Optional[List]:
        return None

    def isVideoFormat(self, url: str) -> bool:
        return any(url.endswith(ext) for ext in ['.m3u8', '.mp4', '.mkv', '.flv'])

    def manualVideoCheck(self) -> bool:
        return False

    def destroy(self) -> None:
        pass

    def _error_result(self, msg: str) -> Dict:
        return {'code': -1, 'msg': msg, 'list': [], 'class': []}