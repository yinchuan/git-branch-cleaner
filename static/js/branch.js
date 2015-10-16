require('angular');
var $ = require('jquery');

angular.module('branches-cleaner', []).controller('BranchController', function($scope){
    // todo 多 dir 支持
    // todo merged 和 unmerged 用不同颜色
    // todo 事件绑定用 angular 来做, 也许可以不用 jquery
    // todo 加一个 reset 到 master 的按钮

    var execSync = require('child_process').execSync;
    var spawnSync = require('child_process').spawnSync;
    var spawn = require('child_process').spawn;
    var fs = require('fs');
    var dataFilePath = require('path').join(require('remote').require('app').getPath('userData'), 'data.txt');

    $scope.getBranchList = function () {
        if (!$scope.isGitDir($scope.gitDir)) return;
        
        var cmd = "git branch -a --no-color | grep -v -w master | tr -d ' '";
        var stderr = [];
        var branches = execSync(cmd, {cwd: $scope.gitDir, stdio : stderr});

        var branchList = branches.toString().split("\n");
        var len = branchList.length;
        // todo 当只有 master 分支时, 表现很不正常
        for (var i = 0; i < len; i++) {
            var branchName = branchList[i];
            if (branchName.indexOf('*') == 0) {
                branchName = branchName.slice(1, branchName.len);
                $scope.currentBranch = branchName;
            }
            if (branchName != "") {
                $scope.branches[branchName] = {
                    isSelect: false,
                    isRemote: $scope.isRemote(branchName),
                    status: '' // deleted, fail, ing
                };
            }
        }
    };

    $scope.selectedBranches = function() {
        var selectBranches = [];
        angular.forEach($scope.branches, function(properties, branchName) {
            if (properties.isSelect) {
                selectBranches.push(branchName);
            }
        });

        return selectBranches;
    };

    $scope.delSelectBranches = function() {
        angular.forEach($scope.selectedBranches(), function(branchName){
            $scope.branches[branchName].status = 'ing...';
            if ($scope.branches[branchName].isRemote) {
                $scope.delRemote(branchName);
            } else {
                $scope.delLocal(branchName);
            }
        });
    };
    
    $scope.delLocal = function (branchName) {
        var r = spawnSync("git", ["branch", "-D", branchName], {cwd: $scope.gitDir});
        if (r.status == 0) {
            $scope.status = ['info', '成功删除 ' + branchName];
            $scope.branches[branchName].status = "删除成功";
        } else {
            $scope.branches[branchName].status = '删除出错。原因: ' + r.stderr.toString();
        }
    };

    $scope.delRemote = function (branchName) {
        var rDel = spawn("git", ["push", "origin", "--delete", branchName.split('/').pop()], {cwd: $scope.gitDir});

        rDel.on('error', function (data) {
            console.log('error: ' + data);
            $scope.branches[branchName].status = '删除出错。原因: ' + data;
        });
        rDel.stderr.on('data', function (data) {
            console.log('stderr: ' + data);
            if (data.indexOf("remote ref does not exist") > -1) {
                // needPrune
                var rPrune = spawnSync('git', ['remote', 'prune', 'origin'], {cwd: $scope.gitDir});
                if (rPrune.status == 0) {
                    $scope.$apply($scope.branches[branchName].status = '删除成功');
                } else {
                    $scope.$apply(function() {$scope.branches[branchName].status = '删除失败, 原因: ' + rPrune.Stderr.toString();});
                }
            } else {
                $scope.$apply(function() {$scope.branches[branchName].status = '删除失败, 原因: ' + data;});
            }
        });
        rDel.on('close', function (code) {
            if (code == 0) {
                $scope.$apply(function() {$scope.branches[branchName].status = '删除成功';});
            }
        });
    };

    $scope.isRemote = function (branchName) {
        return branchName.startsWith('remotes/origin/');
    };

    /**
     * 选中本地分支时, 自动选中远程分支
     * @param selectBranchName
     */
    $scope.selectRemote = function (selectBranchName) {
        if ($scope.branches[selectBranchName].isRemote) return;
        angular.forEach($scope.branches, function (properties, branchName) {
            if ($scope.branches[selectBranchName].isSelect && branchName.endsWith('/' + selectBranchName)) {
                $scope.branches[branchName].isSelect = true;
            }
        });
    };

    /**
     * 让用户选择一个目录, 并做初始化工作
     */
    $scope.init = function (dir) {
        dir = dir || undefined; // js 用这种方式来实现 optional parameter
        if (dir) {
            $scope.selectDir = dir;
        } else {
            var remote = require('remote');
            var dialog = remote.require('dialog');

            // todo 打开选择框后又取消了, 会导致清空当前选择
            var r = dialog.showOpenDialog({properties: ['openDirectory']});
            $scope.selectDir = r == undefined ? r : r.pop();
        }

        // 记录上次选择
        fs.writeFileSync(dataFilePath, $scope.selectDir);
        $scope.branches = {};
        $scope.currentBranch = undefined;
        $scope.gitDir = undefined;
        if ($scope.isGitDir($scope.selectDir)) {
            $scope.gitDir = $scope.selectDir;
            $scope.getBranchList();
        }
    };

    /**
     * 判断是否是一个有效的 git repo
     * @param dir
     */
    $scope.isGitDir = function (dir) {
        if (dir == undefined) return false;

        if(!fs.existsSync(dir) || !fs.lstatSync(dir).isDirectory()) {
            return false;
        }
        var spawn = spawnSync("git", ["branch"], {cwd: dir});
        return spawn.stderr.toString().indexOf('Not a git repository') < 0;
    };

    /**
     * 是否支持拖拽
     * @returns {boolean}
     */
    $scope.isAdvancedSelect = function () {
        return true;
    };
    
    // 如果已经记住上一次选择的 git repo, 直接初始化
    var lastSelectDir = fs.readFileSync(dataFilePath, 'utf-8');
    $scope.init(lastSelectDir);

    if ($scope.isAdvancedSelect()) {
        var form = $('.box');
        var droppedFiles = false;

        form.on('drag dragstart dragend dragover dragenter dragleave drop', function(e) {
            e.preventDefault();
            e.stopPropagation();
        })
            .on('dragover dragenter', function() {
                form.addClass('is-dragover');
            })
            .on('dragleave dragend drop', function() {
                form.removeClass('is-dragover');
            })
            .on('drop', function(e) {
                droppedFiles = e.originalEvent.dataTransfer.files;

                $scope.$apply($scope.init(droppedFiles[0].path));
            });
    }
});