Component({
  properties: {
    files: {
      type: Array,
      value: []
    },
    maxCount: {
      type: Number,
      value: 9
    },
    allowDocument: {
      type: Boolean,
      value: false
    },
    disabled: {
      type: Boolean,
      value: false
    }
  },

  methods: {
    remaining() {
      return Math.max(0, Number(this.properties.maxCount || 0) - this.properties.files.length);
    },

    createFile(path, mediaType, extra = {}) {
      return {
        key: String(Date.now()) + '-' + Math.random().toString(16).slice(2),
        path,
        media_type: mediaType,
        status: 'PENDING',
        ...extra
      };
    },

    append(files) {
      const remaining = this.remaining();
      if (!remaining) {
        wx.showToast({ title: '附件数量已达上限', icon: 'none' });
        return;
      }
      const next = this.properties.files.concat(files.slice(0, remaining));
      this.triggerEvent('change', { files: next });
    },

    chooseMedia(sourceType, failureTitle) {
      if (this.properties.disabled || !this.remaining()) return;
      wx.chooseMedia({
        count: this.remaining(),
        mediaType: ['image', 'video'],
        sourceType: [sourceType],
        camera: 'back',
        maxDuration: 60,
        success: res => {
          const files = (res.tempFiles || []).map(file => this.createFile(
            file.tempFilePath,
            file.fileType === 'video' ? 'VIDEO' : 'IMAGE',
            {
              duration_seconds: file.duration || null,
              size: file.size || null
            }
          ));
          if (!files.length) {
            wx.showToast({ title: '没有读取到图片或视频', icon: 'none' });
            return;
          }
          this.append(files);
        },
        fail: err => {
          const message = String((err && err.errMsg) || '');
          if (message.includes('cancel')) return;
          wx.showToast({
            title: message.includes('auth') || message.includes('permission')
              ? '请允许小程序使用相机或相册'
              : failureTitle,
            icon: 'none'
          });
        }
      });
    },

    chooseCameraMedia() {
      this.chooseMedia('camera', '打开拍摄功能失败，请重试');
    },

    chooseLocalMedia() {
      this.chooseMedia('album', '选择图片或视频失败，请重试');
    },

    chooseDocument() {
      if (!this.properties.allowDocument) return;
      this.chooseMedia('album', '选择物流单据或凭证失败，请重试');
    },

    onRemoveFile(e) {
      if (this.properties.disabled) return;
      const index = Number(e.currentTarget.dataset.index);
      if (!Number.isInteger(index) || index < 0 || index >= this.properties.files.length) {
        wx.showToast({ title: '附件索引无效，请重新选择', icon: 'none' });
        return;
      }
      const files = this.properties.files.slice();
      files.splice(index, 1);
      this.triggerEvent('change', { files });
    },

    retry(e) {
      const index = Number(e.currentTarget.dataset.index);
      if (!Number.isInteger(index) || !this.properties.files[index]) return;
      this.triggerEvent('retry', { index, file: this.properties.files[index] });
    },

    preview(e) {
      const index = Number(e.currentTarget.dataset.index);
      const file = this.properties.files[index];
      if (!file || !file.path) return;
      if (file.media_type === 'IMAGE') {
        wx.previewImage({
          current: file.path,
          urls: this.properties.files
            .filter(item => item.media_type === 'IMAGE' && item.path)
            .map(item => item.path)
        });
        return;
      }
      if (file.media_type === 'VIDEO' && wx.previewMedia) {
        wx.previewMedia({ sources: [{ url: file.path, type: 'video' }] });
      }
    }
  }
});
