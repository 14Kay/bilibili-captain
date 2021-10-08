import FormData from "form-data";
import {ReadStream} from "fs-extra"
import {Request} from "./request";
import {readFile} from "./utils";
import {BiliCredential} from "./biliCredential";
import {SignResp, LiveUserInfoResp, 
    StartLiveResp, StopLiveResp, StreamAddrResp,
    UploadCoverResp, LiveTagsResp,
    BaseInfoResp, RoomInfoResp} from "./types/live";

export class Live {
    private credential: BiliCredential;

    constructor(credential: BiliCredential) {
        this.credential = credential;
    }

    /**
     * 签到
     * @returns 
     */
    async sign(): Promise<SignResp> {
        return Request.get(
            "https://api.live.bilibili.com/xlive/web-ucenter/v1/sign/DoSign",
            {}, this.credential
        ).then(res => res.data);
    }

    /**
     * 个人信息，直播等级，瓜子电池之类的
     * @returns 
     */
    async selfInfo(): Promise<LiveUserInfoResp> {
        return Request.get(
            "https://api.live.bilibili.com/xlive/web-ucenter/user/get_user_info",
            {}, this.credential
        ).then(res => res.data);
    }

    /**
     * 开播
     * @param area 直播分区代码
     * @param roomid 自己的房间号
     * @returns 
     */
    async startLive(area: number, roomid?: number): Promise<StartLiveResp> {
        if (!roomid && !this.credential.info.liveroom?.roomid) throw "未能获取自己的房间号";

        return Request.post(
            "http://api.live.bilibili.com/room/v1/Room/startLive",
            {
                room_id: roomid || this.credential.info.liveroom?.roomid,
                platform: "pc",
                area_v2: area,
                csrf_token: this.credential.csfr,
                csrf: this.credential.csfr
            },
            this.credential
        ).then(res => res.data);
    }

    /**
     * 下播
     * @param roomid 自己的房间号
     * @returns 
     */
    async stopLive(roomid?: number): Promise<StopLiveResp> {
        if (!roomid && !this.credential.info.liveroom?.roomid) throw "未能获取自己的房间号";

        return Request.post(
            "https://api.live.bilibili.com/room/v1/Room/stopLive",
            {
                room_id: roomid || this.credential.info.liveroom?.roomid,
                platform: "pc",
                csrf_token: this.credential.csfr,
                csrf: this.credential.csfr
            },
            this.credential
        ).then(res => res.data);
    }

    /**
     * 获取，刷新推流地址
     * @param reset_key 是否刷新推流地址，默认false
     * @returns 
     */
    async streamAddr(reset_key: false): Promise<StreamAddrResp> {
        return Request.get(
            "https://api.live.bilibili.com/xlive/app-blink/v1/live/getWebUpStreamAddr",
            {
                platform: "web",
                reset_key
            },
            this.credential
        ).then(res => res.data);
    }

    /**
     * 主播公告
     * @param content 说说下次开播的时间和内容吧~
     * @returns 
     */
    async updateRoomNews(content: string): Promise<boolean> {
        if (!this.credential.uid) throw "未能获取自己uid";
        if (!this.credential.info.liveroom?.roomid) throw "未能获取自己的房间号";

        return Request.get(
            "https://api.live.bilibili.com/xlive/app-blink/v1/index/updateRoomNews",
            {
                room_id: this.credential.info.liveroom.roomid,
                uid: this.credential.uid,
                content: content,
                csrf_token: this.credential.csfr,
                csrf: this.credential.csfr
            },
            this.credential
        ).then(res => res.code === 0);
    }

    /**
     * 修改直播间信息
     * @param content 标签名称
     * @param manipulate 操作内容，标题=title，简介=description，新增标签=add_tag，删除标签=del_tag
     * @returns 
     */
    private async _update(content: string, 
    manipulate: "title" | "description" | "add_tag" | "del_tag"): Promise<boolean> {
        if (!this.credential.info.liveroom?.roomid) throw "未能获取自己的房间号";

        interface UpdateForm {
            room_id: number,
            csrf_token: string,
            csrf: string,
            title?: string;
            description?: string;
            add_tag?: string;
            del_tag?: string;
        };

        let form:UpdateForm = {
            room_id: this.credential.info.liveroom.roomid,
            csrf_token: this.credential.csfr,
            csrf: this.credential.csfr
        }

        switch (manipulate) {
            case "title": form.title = content; break;
            case "description": form.description = content; break;
            case "add_tag": form.add_tag = content; break;
            case "del_tag": form.del_tag = content; break;
            default: throw "操作错误";
        }

        return Request.post(
            "https://api.live.bilibili.com/room/v1/Room/update",
            form,
            this.credential
        ).then(res => res.code === 0);
    }

    /**
     * 修改房间标题
     * @param title 标题
     * @returns 
     */
    async updateTitle(title: string): Promise<boolean> {
        return this._update(title, "title");
    }

    /**
     * 修改个人简介
     * @param desc 请输入你的个人简介~
     * @returns 
     */
    async updateDesc(desc: string): Promise<boolean> {
        return this._update(desc, "description");
    }

    /**
     * 更新tag
     * @param tag tag内容
     * @param add_del 新增或删除，默认为true/新增
     * @returns 
     */
    async updateTag(tag: string, add_del: boolean): Promise<boolean> {
        return this._update(tag, add_del ? "add_tag" : "del_tag");
    }

    private async _uploadCover(cover: string | ReadStream): Promise<UploadCoverResp> {
        if (typeof cover === "string") cover = await readFile(cover);
        
        let form = new FormData();
        form.append("file", cover);
        form.append("bucket", "live");
        form.append("dir", "new_room_cover");

        return Request.post(
            `https://api.bilibili.com/x/upload/web/image?csrf=${this.credential.csfr}`,
            form,
            this.credential
        ).then(res => res.data);
    }
    
    async updateCover(cover: string | ReadStream, ): Promise<boolean> {
        if (!this.credential.info.liveroom) throw "房间号未知";
        const img_url = (await this._uploadCover(cover)).location;

        return Request.post(
            "https://api.live.bilibili.com/room/v1/Cover/new_replace_cover",
            {
                room_id: this.credential.info.liveroom.roomid,
                url: img_url,
                pic_id: 1000000 + Math.random() * 100000,  // 好像不太妙
                type: "cover",
                csrf: this.credential.csfr,
                csrf_token: this.credential.csfr,
                visit_id: ""
            },
            this.credential
        ).then(res => res.data);
    }

    /**
     * 获取房间信息
     * @param id 房间号或主播id
     * @param id_type id类型为uid或roomid
     * @returns 
     */
    static async getRoomBaseInfo(id: number, id_type: "uid" | "roomid"): Promise<BaseInfoResp> {
        return Request.get(
            "https://api.live.bilibili.com/xlive/web-room/v1/index/getRoomBaseInfo",
            {
                [id_type === "uid" ? "uids" : "room_ids"] : id,
                req_biz: "space"
            }
        ).then(res => {
            const values = Object.values(
                id_type === "uid" ? res.data.by_uids : res.data.by_room_ids)[0];
            if (!values) throw "没有这个房间号";
            else return values as BaseInfoResp;
        });
    }

    /**
     * 获取房间更详细信息
     * @param room_id 房间号
     * @returns 
     */
    static async getRoomInfo(room_id: number): Promise<RoomInfoResp> {
        return Request.get(
            "https://api.live.bilibili.com/room/v1/Room/get_info",
            {
                room_id,
                from: "space"
            }
        ).then(res => res.data);
    }

    /**
     * 获取直播分区列表
     * @returns 
     */
    static async getAreaList(): Promise<LiveTagsResp> {
        return Request.get(
            "http://api.live.bilibili.com/room/v1/Area/getList",
        ).then(res => res.data);
    }
}