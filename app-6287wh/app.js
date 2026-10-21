// 荣威RX5 控车APP · 首页交互
(function () {
  var toast = document.getElementById('toast');
  var timer = null;

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(function () {
      toast.classList.remove('show');
    }, 1800);
  }

  document.querySelectorAll('.quick-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var action = btn.dataset.action;

      if (action === '解锁' || action === '闭锁') {
        document.querySelectorAll('.quick-btn').forEach(function (b) {
          if (b.dataset.action === '解锁' || b.dataset.action === '闭锁') {
            b.classList.remove('on');
          }
        });
        btn.classList.add('on');
        showToast('指令已发送：车辆' + action);
      } else if (action === '空调') {
        btn.classList.toggle('on');
        showToast(btn.classList.contains('on') ? '空调已开启 · 24°C' : '空调已关闭');
      } else if (action === '寻车') {
        showToast('正在双闪鸣笛寻车…');
        btn.classList.add('on');
        setTimeout(function () { btn.classList.remove('on'); }, 3000);
      } else if (action === '后备箱') {
        btn.classList.toggle('on');
        showToast(btn.classList.contains('on') ? '后备箱已开启' : '后备箱已关闭');
      }
    });
  });

  var names = ['首页', '钥匙', '行程', '服务', '我的'];
  document.querySelectorAll('.tab').forEach(function (tab, i) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (t) {
        t.classList.remove('active');
      });
      tab.classList.add('active');
      if (i !== 0) showToast('「' + names[i] + '」页面即将上线');
    });
  });
})();