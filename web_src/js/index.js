/* globals wipPrefixes */
/* exported timeAddManual, toggleStopwatch, cancelStopwatch */
/* exported toggleDeadlineForm, setDeadline, updateDeadline, deleteDependencyModal, cancelCodeComment, onOAuthLoginClick */

import './publicpath.js';
import './polyfills.js';

import Vue from 'vue';
import {htmlEscape} from 'escape-goat';
import 'jquery.are-you-sure';
import './vendor/semanticdropdown.js';
import {svg} from './utils.js';

import initContextPopups from './features/contextpopup.js';
import initGitGraph from './features/gitgraph.js';
import initClipboard from './features/clipboard.js';
import initUserHeatmap from './features/userheatmap.js';
import initDateTimePicker from './features/datetimepicker.js';
import initServiceWorker from './features/serviceworker.js';
import {initTribute, issuesTribute, emojiTribute} from './features/tribute.js';
import createDropzone from './features/dropzone.js';
import highlight from './features/highlight.js';
import ActivityTopAuthors from './components/ActivityTopAuthors.vue';
import {initNotificationsTable, initNotificationCount} from './features/notification.js';
import {createCodeEditor} from './features/codeeditor.js';

const {AppSubUrl, StaticUrlPrefix, csrf} = window.config;

let previewFileModes;
const commentMDEditors = {};

// Silence fomantic's error logging when tabs are used without a target content element
$.fn.tab.settings.silent = true;

function initCommentPreviewTab($form) {
  const $tabMenu = $form.find('.tabular.menu');
  $tabMenu.find('.item').tab();
  $tabMenu.find(`.item[data-tab="${$tabMenu.data('preview')}"]`).on('click', function () {
    const $this = $(this);
    $.post($this.data('url'), {
      _csrf: csrf,
      mode: 'comment',
      context: $this.data('context'),
      text: $form.find(`.tab[data-tab="${$tabMenu.data('write')}"] textarea`).val()
    }, (data) => {
      const $previewPanel = $form.find(`.tab[data-tab="${$tabMenu.data('preview')}"]`);
      $previewPanel.html(data);
      $('pre code', $previewPanel[0]).each(function () {
        highlight(this);
      });
    });
  });

  buttonsClickOnEnter();
}

function initEditPreviewTab($form) {
  const $tabMenu = $form.find('.tabular.menu');
  $tabMenu.find('.item').tab();
  const $previewTab = $tabMenu.find(`.item[data-tab="${$tabMenu.data('preview')}"]`);
  if ($previewTab.length) {
    previewFileModes = $previewTab.data('preview-file-modes').split(',');
    $previewTab.on('click', function () {
      const $this = $(this);
      let context = `${$this.data('context')}/`;
      const mode = $this.data('markdown-mode') || 'comment';
      const treePathEl = $form.find('input#tree_path');
      if (treePathEl.length > 0) {
        context += treePathEl.val();
      }
      context = context.substring(0, context.lastIndexOf('/'));
      $.post($this.data('url'), {
        _csrf: csrf,
        mode,
        context,
        text: $form.find(`.tab[data-tab="${$tabMenu.data('write')}"] textarea`).val()
      }, (data) => {
        const $previewPanel = $form.find(`.tab[data-tab="${$tabMenu.data('preview')}"]`);
        $previewPanel.html(data);
        $('pre code', $previewPanel[0]).each(function () {
          highlight(this);
        });
      });
    });
  }
}

function initEditDiffTab($form) {
  const $tabMenu = $form.find('.tabular.menu');
  $tabMenu.find('.item').tab();
  $tabMenu.find(`.item[data-tab="${$tabMenu.data('diff')}"]`).on('click', function () {
    const $this = $(this);
    $.post($this.data('url'), {
      _csrf: csrf,
      context: $this.data('context'),
      content: $form.find(`.tab[data-tab="${$tabMenu.data('write')}"] textarea`).val()
    }, (data) => {
      const $diffPreviewPanel = $form.find(`.tab[data-tab="${$tabMenu.data('diff')}"]`);
      $diffPreviewPanel.html(data);
    });
  });
}

function initEditForm() {
  if ($('.edit.form').length === 0) {
    return;
  }

  initEditPreviewTab($('.edit.form'));
  initEditDiffTab($('.edit.form'));
}

function initBranchSelector() {
  const $selectBranch = $('.ui.select-branch');
  const $branchMenu = $selectBranch.find('.reference-list-menu');
  $branchMenu.find('.item:not(.no-select)').click(function () {
    $($(this).data('id-selector')).val($(this).data('id'));
    $selectBranch.find('.ui .branch-name').text($(this).data('name'));
  });
  $selectBranch.find('.reference.column').on('click', function () {
    $selectBranch.find('.scrolling.reference-list-menu').css('display', 'none');
    $selectBranch.find('.reference .text').removeClass('black');
    $($(this).data('target')).css('display', 'block');
    $(this).find('.text').addClass('black');
    return false;
  });
}

function initLabelEdit() {
// Create label
  const $newLabelPanel = $('.new-label.segment');
  $('.new-label.button').on('click', () => {
    $newLabelPanel.show();
  });
  $('.new-label.segment .cancel').on('click', () => {
    $newLabelPanel.hide();
  });

  $('.color-picker').each(function () {
    $(this).minicolors();
  });
  $('.precolors .color').on('click', function () {
    const color_hex = $(this).data('color-hex');
    $('.color-picker').val(color_hex);
    $('.minicolors-swatch-color').css('background-color', color_hex);
  });
  $('.edit-label-button').on('click', function () {
    $('#label-modal-id').val($(this).data('id'));
    $('.edit-label .new-label-input').val($(this).data('title'));
    $('.edit-label .new-label-desc-input').val($(this).data('description'));
    $('.edit-label .color-picker').val($(this).data('color'));
    $('.minicolors-swatch-color').css('background-color', $(this).data('color'));
    $('.edit-label.modal').modal({
      onApprove() {
        $('.edit-label.form').trigger('submit');
      }
    }).modal('show');
    return false;
  });
}

function updateIssuesMeta(url, action, issueIds, elementId, isAdd) {
  return new Promise(((resolve) => {
    $.ajax({
      type: 'POST',
      url,
      data: {
        _csrf: csrf,
        action,
        issue_ids: issueIds,
        id: elementId,
        is_add: isAdd
      },
      success: resolve
    });
  }));
}

function initRepoStatusChecker() {
  const migrating = $('#repo_migrating');
  $('#repo_migrating_failed').hide();
  if (migrating) {
    const repo_name = migrating.attr('repo');
    if (typeof repo_name === 'undefined') {
      return;
    }
    $.ajax({
      type: 'GET',
      url: `${AppSubUrl}/${repo_name}/status`,
      data: {
        _csrf: csrf,
      },
      complete(xhr) {
        if (xhr.status === 200) {
          if (xhr.responseJSON) {
            if (xhr.responseJSON.status === 0) {
              window.location.reload();
              return;
            }

            setTimeout(() => {
              initRepoStatusChecker();
            }, 2000);
            return;
          }
        }
        $('#repo_migrating_progress').hide();
        $('#repo_migrating_failed').show();
      }
    });
  }
}

function initReactionSelector(parent) {
  let reactions = '';
  if (!parent) {
    parent = $(document);
    reactions = '.reactions > ';
  }

  parent.find(`${reactions}a.label`).popup({position: 'bottom left', metadata: {content: 'title', title: 'none'}});

  parent.find(`.select-reaction > .menu > .item, ${reactions}a.label`).on('click', function (e) {
    const vm = this;
    e.preventDefault();

    if ($(this).hasClass('disabled')) return;

    const actionURL = $(this).hasClass('item') ? $(this).closest('.select-reaction').data('action-url') : $(this).data('action-url');
    const url = `${actionURL}/${$(this).hasClass('blue') ? 'unreact' : 'react'}`;
    $.ajax({
      type: 'POST',
      url,
      data: {
        _csrf: csrf,
        content: $(this).data('content')
      }
    }).done((resp) => {
      if (resp && (resp.html || resp.empty)) {
        const content = $(vm).closest('.content');
        let react = content.find('.segment.reactions');
        if ((!resp.empty || resp.html === '') && react.length > 0) {
          react.remove();
        }
        if (!resp.empty) {
          react = $('<div class="ui attached segment reactions"></div>');
          const attachments = content.find('.segment.bottom:first');
          if (attachments.length > 0) {
            react.insertBefore(attachments);
          } else {
            react.appendTo(content);
          }
          react.html(resp.html);
          react.find('.dropdown').dropdown();
          initReactionSelector(react);
        }
      }
    });
  });
}

function insertAtCursor(field, value) {
  if (field.selectionStart || field.selectionStart === 0) {
    const startPos = field.selectionStart;
    const endPos = field.selectionEnd;
    field.value = field.value.substring(0, startPos) + value + field.value.substring(endPos, field.value.length);
    field.selectionStart = startPos + value.length;
    field.selectionEnd = startPos + value.length;
  } else {
    field.value += value;
  }
}

function replaceAndKeepCursor(field, oldval, newval) {
  if (field.selectionStart || field.selectionStart === 0) {
    const startPos = field.selectionStart;
    const endPos = field.selectionEnd;
    field.value = field.value.replace(oldval, newval);
    field.selectionStart = startPos + newval.length - oldval.length;
    field.selectionEnd = endPos + newval.length - oldval.length;
  } else {
    field.value = field.value.replace(oldval, newval);
  }
}

function retrieveImageFromClipboardAsBlob(pasteEvent, callback) {
  if (!pasteEvent.clipboardData) {
    return;
  }

  const {items} = pasteEvent.clipboardData;
  if (typeof items === 'undefined') {
    return;
  }

  for (let i = 0; i < items.length; i++) {
    if (!items[i].type.includes('image')) continue;
    const blob = items[i].getAsFile();

    if (typeof (callback) === 'function') {
      pasteEvent.preventDefault();
      pasteEvent.stopPropagation();
      callback(blob);
    }
  }
}

function uploadFile(file, callback) {
  const xhr = new XMLHttpRequest();

  xhr.addEventListener('load', () => {
    if (xhr.status === 200) {
      callback(xhr.responseText);
    }
  });

  xhr.open('post', `${AppSubUrl}/attachments`, true);
  xhr.setRequestHeader('X-Csrf-Token', csrf);
  const formData = new FormData();
  formData.append('file', file, file.name);
  xhr.send(formData);
}

function reload() {
  window.location.reload();
}

function initImagePaste(target) {
  target.each(function () {
    const field = this;
    field.addEventListener('paste', (event) => {
      retrieveImageFromClipboardAsBlob(event, (img) => {
        const name = img.name.substr(0, img.name.lastIndexOf('.'));
        insertAtCursor(field, `![${name}]()`);
        uploadFile(img, (res) => {
          const data = JSON.parse(res);
          replaceAndKeepCursor(field, `![${name}]()`, `![${name}](${AppSubUrl}/attachments/${data.uuid})`);
          const input = $(`<input id="${data.uuid}" name="files" type="hidden">`).val(data.uuid);
          $('.files').append(input);
        });
      });
    }, false);
  });
}

function initSimpleMDEImagePaste(simplemde, files) {
  simplemde.codemirror.on('paste', (_, event) => {
    retrieveImageFromClipboardAsBlob(event, (img) => {
      const name = img.name.substr(0, img.name.lastIndexOf('.'));
      uploadFile(img, (res) => {
        const data = JSON.parse(res);
        const pos = simplemde.codemirror.getCursor();
        simplemde.codemirror.replaceRange(`![${name}](${AppSubUrl}/attachments/${data.uuid})`, pos);
        const input = $(`<input id="${data.uuid}" name="files" type="hidden">`).val(data.uuid);
        files.append(input);
      });
    });
  });
}

let autoSimpleMDE;

function initCommentForm() {
  if ($('.comment.form').length === 0) {
    return;
  }

  autoSimpleMDE = setCommentSimpleMDE($('.comment.form textarea:not(.review-textarea)'));
  initBranchSelector();
  initCommentPreviewTab($('.comment.form'));
  initImagePaste($('.comment.form textarea'));

  // Listsubmit
  function initListSubmits(selector, outerSelector) {
    const $list = $(`.ui.${outerSelector}.list`);
    const $noSelect = $list.find('.no-select');
    const $listMenu = $(`.${selector} .menu`);
    let hasLabelUpdateAction = $listMenu.data('action') === 'update';
    const labels = {};

    $(`.${selector}`).dropdown('setting', 'onHide', () => {
      hasLabelUpdateAction = $listMenu.data('action') === 'update'; // Update the var
      if (hasLabelUpdateAction) {
        const promises = [];
        Object.keys(labels).forEach((elementId) => {
          const label = labels[elementId];
          const promise = updateIssuesMeta(
            label['update-url'],
            label.action,
            label['issue-id'],
            elementId,
            label['is-checked']
          );
          promises.push(promise);
        });
        Promise.all(promises).then(reload);
      }
    });

    $listMenu.find('.item:not(.no-select)').on('click', function () {
      // we don't need the action attribute when updating assignees
      if (selector === 'select-assignees-modify' || selector === 'select-reviewers-modify') {
        // UI magic. We need to do this here, otherwise it would destroy the functionality of
        // adding/removing labels

        if ($(this).data('can-change') === 'block') {
          return false;
        }

        if ($(this).hasClass('checked')) {
          $(this).removeClass('checked');
          $(this).find('.octicon-check').addClass('invisible');
          $(this).data('is-checked', 'remove');
        } else {
          $(this).addClass('checked');
          $(this).find('.octicon-check').removeClass('invisible');
          $(this).data('is-checked', 'add');
        }

        updateIssuesMeta(
          $listMenu.data('update-url'),
          '',
          $listMenu.data('issue-id'),
          $(this).data('id'),
          $(this).data('is-checked')
        );
        $listMenu.data('action', 'update'); // Update to reload the page when we updated items
        return false;
      }

      if ($(this).hasClass('checked')) {
        $(this).removeClass('checked');
        $(this).find('.octicon-check').addClass('invisible');
        if (hasLabelUpdateAction) {
          if (!($(this).data('id') in labels)) {
            labels[$(this).data('id')] = {
              'update-url': $listMenu.data('update-url'),
              action: 'detach',
              'issue-id': $listMenu.data('issue-id'),
            };
          } else {
            delete labels[$(this).data('id')];
          }
        }
      } else {
        $(this).addClass('checked');
        $(this).find('.octicon-check').removeClass('invisible');
        if (hasLabelUpdateAction) {
          if (!($(this).data('id') in labels)) {
            labels[$(this).data('id')] = {
              'update-url': $listMenu.data('update-url'),
              action: 'attach',
              'issue-id': $listMenu.data('issue-id'),
            };
          } else {
            delete labels[$(this).data('id')];
          }
        }
      }

      const listIds = [];
      $(this).parent().find('.item').each(function () {
        if ($(this).hasClass('checked')) {
          listIds.push($(this).data('id'));
          $($(this).data('id-selector')).removeClass('hide');
        } else {
          $($(this).data('id-selector')).addClass('hide');
        }
      });
      if (listIds.length === 0) {
        $noSelect.removeClass('hide');
      } else {
        $noSelect.addClass('hide');
      }
      $($(this).parent().data('id')).val(listIds.join(','));
      return false;
    });
    $listMenu.find('.no-select.item').on('click', function () {
      if (hasLabelUpdateAction || selector === 'select-assignees-modify') {
        updateIssuesMeta(
          $listMenu.data('update-url'),
          'clear',
          $listMenu.data('issue-id'),
          '',
          ''
        ).then(reload);
      }

      $(this).parent().find('.item').each(function () {
        $(this).removeClass('checked');
        $(this).find('.octicon').addClass('invisible');
        $(this).data('is-checked', 'remove');
      });

      $list.find('.item').each(function () {
        $(this).addClass('hide');
      });
      $noSelect.removeClass('hide');
      $($(this).parent().data('id')).val('');
    });
  }

  // Init labels and assignees
  initListSubmits('select-label', 'labels');
  initListSubmits('select-assignees', 'assignees');
  initListSubmits('select-assignees-modify', 'assignees');
  initListSubmits('select-reviewers-modify', 'assignees');

  function selectItem(select_id, input_id) {
    const $menu = $(`${select_id} .menu`);
    const $list = $(`.ui${select_id}.list`);
    const hasUpdateAction = $menu.data('action') === 'update';

    $menu.find('.item:not(.no-select)').on('click', function () {
      $(this).parent().find('.item').each(function () {
        $(this).removeClass('selected active');
      });

      $(this).addClass('selected active');
      if (hasUpdateAction) {
        updateIssuesMeta(
          $menu.data('update-url'),
          '',
          $menu.data('issue-id'),
          $(this).data('id'),
          $(this).data('is-checked')
        ).then(reload);
      }
      switch (input_id) {
        case '#milestone_id':
          $list.find('.selected').html(`<a class="item" href=${$(this).data('href')}>${
            htmlEscape($(this).text())}</a>`);
          break;
        case '#assignee_id':
          $list.find('.selected').html(`<a class="item" href=${$(this).data('href')}>` +
                        `<img class="ui avatar image" src=${$(this).data('avatar')}>${
                          htmlEscape($(this).text())}</a>`);
      }
      $(`.ui${select_id}.list .no-select`).addClass('hide');
      $(input_id).val($(this).data('id'));
    });
    $menu.find('.no-select.item').on('click', function () {
      $(this).parent().find('.item:not(.no-select)').each(function () {
        $(this).removeClass('selected active');
      });

      if (hasUpdateAction) {
        updateIssuesMeta(
          $menu.data('update-url'),
          '',
          $menu.data('issue-id'),
          $(this).data('id'),
          $(this).data('is-checked')
        ).then(reload);
      }

      $list.find('.selected').html('');
      $list.find('.no-select').removeClass('hide');
      $(input_id).val('');
    });
  }

  // Milestone and assignee
  selectItem('.select-milestone', '#milestone_id');
  selectItem('.select-assignee', '#assignee_id');
}

function initInstall() {
  if ($('.install').length === 0) {
    return;
  }

  if ($('#db_host').val() === '') {
    $('#db_host').val('127.0.0.1:3306');
    $('#db_user').val('gitea');
    $('#db_name').val('gitea');
  }

  // Database type change detection.
  $('#db_type').on('change', function () {
    const sqliteDefault = 'data/gitea.db';
    const tidbDefault = 'data/gitea_tidb';

    const dbType = $(this).val();
    if (dbType === 'SQLite3') {
      $('#sql_settings').hide();
      $('#pgsql_settings').hide();
      $('#mysql_settings').hide();
      $('#sqlite_settings').show();

      if (dbType === 'SQLite3' && $('#db_path').val() === tidbDefault) {
        $('#db_path').val(sqliteDefault);
      }
      return;
    }

    const dbDefaults = {
      MySQL: '127.0.0.1:3306',
      PostgreSQL: '127.0.0.1:5432',
      MSSQL: '127.0.0.1:1433'
    };

    $('#sqlite_settings').hide();
    $('#sql_settings').show();

    $('#pgsql_settings').toggle(dbType === 'PostgreSQL');
    $('#mysql_settings').toggle(dbType === 'MySQL');
    $.each(dbDefaults, (_type, defaultHost) => {
      if ($('#db_host').val() === defaultHost) {
        $('#db_host').val(dbDefaults[dbType]);
        return false;
      }
    });
  });

  // TODO: better handling of exclusive relations.
  $('#offline-mode input').on('change', function () {
    if ($(this).is(':checked')) {
      $('#disable-gravatar').checkbox('check');
      $('#federated-avatar-lookup').checkbox('uncheck');
    }
  });
  $('#disable-gravatar input').on('change', function () {
    if ($(this).is(':checked')) {
      $('#federated-avatar-lookup').checkbox('uncheck');
    } else {
      $('#offline-mode').checkbox('uncheck');
    }
  });
  $('#federated-avatar-lookup input').on('change', function () {
    if ($(this).is(':checked')) {
      $('#disable-gravatar').checkbox('uncheck');
      $('#offline-mode').checkbox('uncheck');
    }
  });
  $('#enable-openid-signin input').on('change', function () {
    if ($(this).is(':checked')) {
      if (!$('#disable-registration input').is(':checked')) {
        $('#enable-openid-signup').checkbox('check');
      }
    } else {
      $('#enable-openid-signup').checkbox('uncheck');
    }
  });
  $('#disable-registration input').on('change', function () {
    if ($(this).is(':checked')) {
      $('#enable-captcha').checkbox('uncheck');
      $('#enable-openid-signup').checkbox('uncheck');
    } else {
      $('#enable-openid-signup').checkbox('check');
    }
  });
  $('#enable-captcha input').on('change', function () {
    if ($(this).is(':checked')) {
      $('#disable-registration').checkbox('uncheck');
    }
  });
}

function initIssueComments() {
  if ($('.repository.view.issue .timeline').length === 0) return;

  $('.re-request-review').on('click', function (event) {
    const url = $(this).data('update-url');
    const issueId = $(this).data('issue-id');
    const id = $(this).data('id');
    const isChecked = $(this).data('is-checked');

    event.preventDefault();
    updateIssuesMeta(
      url,
      '',
      issueId,
      id,
      isChecked
    ).then(reload);
  });

  $(document).on('click', (event) => {
    const urlTarget = $(':target');
    if (urlTarget.length === 0) return;

    const urlTargetId = urlTarget.attr('id');
    if (!urlTargetId) return;
    if (!/^(issue|pull)(comment)?-\d+$/.test(urlTargetId)) return;

    const $target = $(event.target);

    if ($target.closest(`#${urlTargetId}`).length === 0) {
      const scrollPosition = $(window).scrollTop();
      window.location.hash = '';
      $(window).scrollTop(scrollPosition);
      window.history.pushState(null, null, ' ');
    }
  });
}

async function initRepository() {
  if ($('.repository').length === 0) {
    return;
  }

  function initFilterSearchDropdown(selector) {
    const $dropdown = $(selector);
    $dropdown.dropdown({
      fullTextSearch: true,
      selectOnKeydown: false,
      onChange(_text, _value, $choice) {
        if ($choice.data('url')) {
          window.location.href = $choice.data('url');
        }
      },
      message: {noResults: $dropdown.data('no-results')}
    });
  }

  // File list and commits
  if ($('.repository.file.list').length > 0 || ('.repository.commits').length > 0) {
    initFilterBranchTagDropdown('.choose.reference .dropdown');
  }

  // Wiki
  if ($('.repository.wiki.view').length > 0) {
    initFilterSearchDropdown('.choose.page .dropdown');
  }

  // Options
  if ($('.repository.settings.options').length > 0) {
    // Enable or select internal/external wiki system and issue tracker.
    $('.enable-system').on('change', function () {
      if (this.checked) {
        $($(this).data('target')).removeClass('disabled');
        if (!$(this).data('context')) $($(this).data('context')).addClass('disabled');
      } else {
        $($(this).data('target')).addClass('disabled');
        if (!$(this).data('context')) $($(this).data('context')).removeClass('disabled');
      }
    });
    $('.enable-system-radio').on('change', function () {
      if (this.value === 'false') {
        $($(this).data('target')).addClass('disabled');
        if (typeof $(this).data('context') !== 'undefined') $($(this).data('context')).removeClass('disabled');
      } else if (this.value === 'true') {
        $($(this).data('target')).removeClass('disabled');
        if (typeof $(this).data('context') !== 'undefined') $($(this).data('context')).addClass('disabled');
      }
    });
  }

  // Labels
  if ($('.repository.labels').length > 0) {
    initLabelEdit();
  }

  // Milestones
  if ($('.repository.new.milestone').length > 0) {
    const $datepicker = $('.milestone.datepicker');

    await initDateTimePicker($datepicker.data('lang'));

    $datepicker.datetimepicker({
      inline: true,
      timepicker: false,
      startDate: $datepicker.data('start-date'),
      onSelectDate(date) {
        $('#deadline').val(date.toISOString().substring(0, 10));
      },
    });
    $('#clear-date').on('click', () => {
      $('#deadline').val('');
      return false;
    });
  }

  // Issues
  if ($('.repository.view.issue').length > 0) {
    // Edit issue title
    const $issueTitle = $('#issue-title');
    const $editInput = $('#edit-title-input input');
    const editTitleToggle = function () {
      $issueTitle.toggle();
      $('.not-in-edit').toggle();
      $('#edit-title-input').toggle();
      $('#pull-desc').toggle();
      $('#pull-desc-edit').toggle();
      $('.in-edit').toggle();
      $editInput.focus();
      return false;
    };

    const changeBranchSelect = function () {
      const selectionTextField = $('#pull-target-branch');

      const baseName = selectionTextField.data('basename');
      const branchNameNew = $(this).data('branch');
      const branchNameOld = selectionTextField.data('branch');

      // Replace branch name to keep translation from HTML template
      selectionTextField.html(selectionTextField.html().replace(
        `${baseName}:${branchNameOld}`,
        `${baseName}:${branchNameNew}`
      ));
      selectionTextField.data('branch', branchNameNew); // update branch name in setting
    };
    $('#branch-select > .item').on('click', changeBranchSelect);

    $('#edit-title').on('click', editTitleToggle);
    $('#cancel-edit-title').on('click', editTitleToggle);
    $('#save-edit-title').on('click', editTitleToggle).on('click', function () {
      const pullrequest_targetbranch_change = function (update_url) {
        const targetBranch = $('#pull-target-branch').data('branch');
        const $branchTarget = $('#branch_target');
        if (targetBranch === $branchTarget.text()) {
          return false;
        }
        $.post(update_url, {
          _csrf: csrf,
          target_branch: targetBranch
        }).done((data) => {
          $branchTarget.text(data.base_branch);
        }).always(() => {
          reload();
        });
      };

      const pullrequest_target_update_url = $(this).data('target-update-url');
      if ($editInput.val().length === 0 || $editInput.val() === $issueTitle.text()) {
        $editInput.val($issueTitle.text());
        pullrequest_targetbranch_change(pullrequest_target_update_url);
      } else {
        $.post($(this).data('update-url'), {
          _csrf: csrf,
          title: $editInput.val()
        }, (data) => {
          $editInput.val(data.title);
          $issueTitle.text(data.title);
          pullrequest_targetbranch_change(pullrequest_target_update_url);
          reload();
        });
      }
      return false;
    });

    // Issue Comments
    initIssueComments();

    // Issue/PR Context Menus
    $('.context-dropdown').dropdown({
      action: 'hide'
    });

    // Quote reply
    $('.quote-reply').on('click', function (event) {
      $(this).closest('.dropdown').find('.menu').toggle('visible');
      const target = $(this).data('target');
      const quote = $(`#comment-${target}`).text().replace(/\n/g, '\n> ');
      const content = `> ${quote}\n\n`;

      let $content;
      if ($(this).hasClass('quote-reply-diff')) {
        const $parent = $(this).closest('.comment-code-cloud');
        $parent.find('button.comment-form-reply').trigger('click');
        $content = $parent.find('[name="content"]');
        if ($content.val() !== '') {
          $content.val(`${$content.val()}\n\n${content}`);
        } else {
          $content.val(`${content}`);
        }
        $content.focus();
      } else if (autoSimpleMDE !== null) {
        if (autoSimpleMDE.value() !== '') {
          autoSimpleMDE.value(`${autoSimpleMDE.value()}\n\n${content}`);
        } else {
          autoSimpleMDE.value(`${content}`);
        }
      }
      event.preventDefault();
    });

    // Edit issue or comment content
    $('.edit-content').on('click', async function (event) {
      $(this).closest('.dropdown').find('.menu').toggle('visible');
      const $segment = $(this).closest('.header').next();
      const $editContentZone = $segment.find('.edit-content-zone');
      const $renderContent = $segment.find('.render-content');
      const $rawContent = $segment.find('.raw-content');
      let $textarea;
      let $simplemde;

      // Setup new form
      if ($editContentZone.html().length === 0) {
        $editContentZone.html($('#edit-content-form').html());
        $textarea = $editContentZone.find('textarea');
        issuesTribute.attach($textarea.get());
        emojiTribute.attach($textarea.get());

        let dz;
        const $dropzone = $editContentZone.find('.dropzone');
        const $files = $editContentZone.find('.comment-files');
        if ($dropzone.length > 0) {
          $dropzone.data('saved', false);

          const filenameDict = {};
          dz = await createDropzone($dropzone[0], {
            url: $dropzone.data('upload-url'),
            headers: {'X-Csrf-Token': csrf},
            maxFiles: $dropzone.data('max-file'),
            maxFilesize: $dropzone.data('max-size'),
            acceptedFiles: ($dropzone.data('accepts') === '*/*') ? null : $dropzone.data('accepts'),
            addRemoveLinks: true,
            dictDefaultMessage: $dropzone.data('default-message'),
            dictInvalidFileType: $dropzone.data('invalid-input-type'),
            dictFileTooBig: $dropzone.data('file-too-big'),
            dictRemoveFile: $dropzone.data('remove-file'),
            timeout: 0,
            init() {
              this.on('success', (file, data) => {
                filenameDict[file.name] = {
                  uuid: data.uuid,
                  submitted: false
                };
                const input = $(`<input id="${data.uuid}" name="files" type="hidden">`).val(data.uuid);
                $files.append(input);
              });
              this.on('removedfile', (file) => {
                if (!(file.name in filenameDict)) {
                  return;
                }
                $(`#${filenameDict[file.name].uuid}`).remove();
                if ($dropzone.data('remove-url') && $dropzone.data('csrf') && !filenameDict[file.name].submitted) {
                  $.post($dropzone.data('remove-url'), {
                    file: filenameDict[file.name].uuid,
                    _csrf: $dropzone.data('csrf')
                  });
                }
              });
              this.on('submit', () => {
                $.each(filenameDict, (name) => {
                  filenameDict[name].submitted = true;
                });
              });
              this.on('reload', () => {
                $.getJSON($editContentZone.data('attachment-url'), (data) => {
                  dz.removeAllFiles(true);
                  $files.empty();
                  $.each(data, function () {
                    const imgSrc = `${$dropzone.data('upload-url')}/${this.uuid}`;
                    dz.emit('addedfile', this);
                    dz.emit('thumbnail', this, imgSrc);
                    dz.emit('complete', this);
                    dz.files.push(this);
                    filenameDict[this.name] = {
                      submitted: true,
                      uuid: this.uuid
                    };
                    $dropzone.find(`img[src='${imgSrc}']`).css('max-width', '100%');
                    const input = $(`<input id="${this.uuid}" name="files" type="hidden">`).val(this.uuid);
                    $files.append(input);
                  });
                });
              });
            }
          });
          dz.emit('reload');
        }
        // Give new write/preview data-tab name to distinguish from others
        const $editContentForm = $editContentZone.find('.ui.comment.form');
        const $tabMenu = $editContentForm.find('.tabular.menu');
        $tabMenu.attr('data-write', $editContentZone.data('write'));
        $tabMenu.attr('data-preview', $editContentZone.data('preview'));
        $tabMenu.find('.write.item').attr('data-tab', $editContentZone.data('write'));
        $tabMenu.find('.preview.item').attr('data-tab', $editContentZone.data('preview'));
        $editContentForm.find('.write').attr('data-tab', $editContentZone.data('write'));
        $editContentForm.find('.preview').attr('data-tab', $editContentZone.data('preview'));
        $simplemde = setCommentSimpleMDE($textarea);
        commentMDEditors[$editContentZone.data('write')] = $simplemde;
        initCommentPreviewTab($editContentForm);
        initSimpleMDEImagePaste($simplemde, $files);

        $editContentZone.find('.cancel.button').on('click', () => {
          $renderContent.show();
          $editContentZone.hide();
          dz.emit('reload');
        });
        $editContentZone.find('.save.button').on('click', () => {
          $renderContent.show();
          $editContentZone.hide();
          const $attachments = $files.find('[name=files]').map(function () {
            return $(this).val();
          }).get();
          $.post($editContentZone.data('update-url'), {
            _csrf: csrf,
            content: $textarea.val(),
            context: $editContentZone.data('context'),
            files: $attachments
          }, (data) => {
            if (data.length === 0) {
              $renderContent.html($('#no-content').html());
            } else {
              $renderContent.html(data.content);
              $('pre code', $renderContent[0]).each(function () {
                highlight(this);
              });
            }
            const $content = $segment.parent();
            if (!$content.find('.ui.small.images').length) {
              if (data.attachments !== '') {
                $content.append(
                  '<div class="ui bottom attached segment"><div class="ui small images"></div></div>'
                );
                $content.find('.ui.small.images').html(data.attachments);
              }
            } else if (data.attachments === '') {
              $content.find('.ui.small.images').parent().remove();
            } else {
              $content.find('.ui.small.images').html(data.attachments);
            }
            dz.emit('submit');
            dz.emit('reload');
          });
        });
      } else {
        $textarea = $segment.find('textarea');
        $simplemde = commentMDEditors[$editContentZone.data('write')];
      }

      // Show write/preview tab and copy raw content as needed
      $editContentZone.show();
      $renderContent.hide();
      if ($textarea.val().length === 0) {
        $textarea.val($rawContent.text());
        $simplemde.value($rawContent.text());
      }
      $textarea.focus();
      $simplemde.codemirror.focus();
      event.preventDefault();
    });

    // Delete comment
    $('.delete-comment').on('click', function () {
      const $this = $(this);
      if (window.confirm($this.data('locale'))) {
        $.post($this.data('url'), {
          _csrf: csrf
        }).done(() => {
          $(`#${$this.data('comment-id')}`).remove();
        });
      }
      return false;
    });

    // Change status
    const $statusButton = $('#status-button');
    $('#comment-form .edit_area').on('keyup', function () {
      if ($(this).val().length === 0) {
        $statusButton.text($statusButton.data('status'));
      } else {
        $statusButton.text($statusButton.data('status-and-comment'));
      }
    });
    $statusButton.on('click', () => {
      $('#status').val($statusButton.data('status-val'));
      $('#comment-form').trigger('submit');
    });

    // Pull Request merge button
    const $mergeButton = $('.merge-button > button');
    $mergeButton.on('click', function (e) {
      e.preventDefault();
      $(`.${$(this).data('do')}-fields`).show();
      $(this).parent().hide();
    });
    $('.merge-button > .dropdown').dropdown({
      onChange(_text, _value, $choice) {
        if ($choice.data('do')) {
          $mergeButton.find('.button-text').text($choice.text());
          $mergeButton.data('do', $choice.data('do'));
        }
      }
    });
    $('.merge-cancel').on('click', function (e) {
      e.preventDefault();
      $(this).closest('.form').hide();
      $mergeButton.parent().show();
    });
    initReactionSelector();
  }

  // Diff
  if ($('.repository.diff').length > 0) {
    $('.diff-counter').each(function () {
      const $item = $(this);
      const addLine = $item.find('span[data-line].add').data('line');
      const delLine = $item.find('span[data-line].del').data('line');
      const addPercent = parseFloat(addLine) / (parseFloat(addLine) + parseFloat(delLine)) * 100;
      $item.find('.bar .add').css('width', `${addPercent}%`);
    });
  }

  // Quick start and repository home
  $('#repo-clone-ssh').on('click', function () {
    $('.clone-url').text($(this).data('link'));
    $('#repo-clone-url').val($(this).data('link'));
    $(this).addClass('blue');
    $('#repo-clone-https').removeClass('blue');
    localStorage.setItem('repo-clone-protocol', 'ssh');
  });
  $('#repo-clone-https').on('click', function () {
    $('.clone-url').text($(this).data('link'));
    $('#repo-clone-url').val($(this).data('link'));
    $(this).addClass('blue');
    if ($('#repo-clone-ssh').length > 0) {
      $('#repo-clone-ssh').removeClass('blue');
      localStorage.setItem('repo-clone-protocol', 'https');
    }
  });
  $('#repo-clone-url').on('click', function () {
    $(this).select();
  });

  // Pull request
  const $repoComparePull = $('.repository.compare.pull');
  if ($repoComparePull.length > 0) {
    initFilterSearchDropdown('.choose.branch .dropdown');
    // show pull request form
    $repoComparePull.find('button.show-form').on('click', function (e) {
      e.preventDefault();
      $repoComparePull.find('.pullrequest-form').show();
      autoSimpleMDE.codemirror.refresh();
      $(this).parent().hide();
    });
  }

  // Branches
  if ($('.repository.settings.branches').length > 0) {
    initFilterSearchDropdown('.protected-branches .dropdown');
    $('.enable-protection, .enable-whitelist, .enable-statuscheck').on('change', function () {
      if (this.checked) {
        $($(this).data('target')).removeClass('disabled');
      } else {
        $($(this).data('target')).addClass('disabled');
      }
    });
    $('.disable-whitelist').on('change', function () {
      if (this.checked) {
        $($(this).data('target')).addClass('disabled');
      }
    });
  }

  // Language stats
  if ($('.language-stats').length > 0) {
    $('.language-stats').on('click', (e) => {
      e.preventDefault();
      $('.language-stats-details, .repository-menu').slideToggle();
    });
  }
}

function initMigration() {
  const toggleMigrations = function () {
    const authUserName = $('#auth_username').val();
    const cloneAddr = $('#clone_addr').val();
    if (!$('#mirror').is(':checked') && (authUserName && authUserName.length > 0) &&
        (cloneAddr !== undefined && (cloneAddr.startsWith('https://github.com') || cloneAddr.startsWith('http://github.com') || cloneAddr.startsWith('http://gitlab.com') || cloneAddr.startsWith('https://gitlab.com')))) {
      $('#migrate_items').show();
    } else {
      $('#migrate_items').hide();
    }
  };

  toggleMigrations();

  $('#clone_addr').on('input', toggleMigrations);
  $('#auth_username').on('input', toggleMigrations);
  $('#mirror').on('change', toggleMigrations);
}

function initPullRequestReview() {
  $('.show-outdated').on('click', function (e) {
    e.preventDefault();
    const id = $(this).data('comment');
    $(this).addClass('hide');
    $(`#code-comments-${id}`).removeClass('hide');
    $(`#code-preview-${id}`).removeClass('hide');
    $(`#hide-outdated-${id}`).removeClass('hide');
  });

  $('.hide-outdated').on('click', function (e) {
    e.preventDefault();
    const id = $(this).data('comment');
    $(this).addClass('hide');
    $(`#code-comments-${id}`).addClass('hide');
    $(`#code-preview-${id}`).addClass('hide');
    $(`#show-outdated-${id}`).removeClass('hide');
  });

  $('button.comment-form-reply').on('click', function (e) {
    e.preventDefault();
    $(this).hide();
    const form = $(this).parent().find('.comment-form');
    form.removeClass('hide');
    const $textarea = form.find('textarea');
    let $simplemde;
    if ($textarea.data('simplemde')) {
      $simplemde = $textarea.data('simplemde');
    } else {
      issuesTribute.attach($textarea.get());
      emojiTribute.attach($textarea.get());
      $simplemde = setCommentSimpleMDE($textarea);
      $textarea.data('simplemde', $simplemde);
    }
    $textarea.focus();
    $simplemde.codemirror.focus();
    assingMenuAttributes(form.find('.menu'));
  });
  // The following part is only for diff views
  if ($('.repository.pull.diff').length === 0) {
    return;
  }

  $('.diff-detail-box.ui.sticky').sticky();

  $('.btn-review').on('click', function (e) {
    e.preventDefault();
    $(this).closest('.dropdown').find('.menu').toggle('visible');
  }).closest('.dropdown').find('.link.close')
    .on('click', function (e) {
      e.preventDefault();
      $(this).closest('.menu').toggle('visible');
    });

  $('.code-view .lines-code,.code-view .lines-num')
    .on('mouseenter', function () {
      const parent = $(this).closest('td');
      $(this).closest('tr').addClass(
        parent.hasClass('lines-num-old') || parent.hasClass('lines-code-old') ? 'focus-lines-old' : 'focus-lines-new'
      );
    })
    .on('mouseleave', function () {
      $(this).closest('tr').removeClass('focus-lines-new focus-lines-old');
    });
  $('.add-code-comment').on('click', function (e) {
    // https://github.com/go-gitea/gitea/issues/4745
    if ($(e.target).hasClass('btn-add-single')) {
      return;
    }
    e.preventDefault();
    const isSplit = $(this).closest('.code-diff').hasClass('code-diff-split');
    const side = $(this).data('side');
    const idx = $(this).data('idx');
    const path = $(this).data('path');
    const form = $('#pull_review_add_comment').html();
    const tr = $(this).closest('tr');
    let ntr = tr.next();
    if (!ntr.hasClass('add-comment')) {
      ntr = $(`<tr class="add-comment">${
        isSplit ? '<td class="lines-num"></td><td class="lines-type-marker"></td><td class="add-comment-left"></td><td class="lines-num"></td><td class="lines-type-marker"></td><td class="add-comment-right"></td>' :
          '<td class="lines-num"></td><td class="lines-num"></td><td class="add-comment-left add-comment-right" colspan="2"></td>'
      }</tr>`);
      tr.after(ntr);
    }
    const td = ntr.find(`.add-comment-${side}`);
    let commentCloud = td.find('.comment-code-cloud');
    if (commentCloud.length === 0) {
      td.html(form);
      commentCloud = td.find('.comment-code-cloud');
      assingMenuAttributes(commentCloud.find('.menu'));

      td.find("input[name='line']").val(idx);
      td.find("input[name='side']").val(side === 'left' ? 'previous' : 'proposed');
      td.find("input[name='path']").val(path);
    }
    const $textarea = commentCloud.find('textarea');
    issuesTribute.attach($textarea.get());
    emojiTribute.attach($textarea.get());

    const $simplemde = setCommentSimpleMDE($textarea);
    $textarea.focus();
    $simplemde.codemirror.focus();
  });
}

function assingMenuAttributes(menu) {
  const id = Math.floor(Math.random() * Math.floor(1000000));
  menu.attr('data-write', menu.attr('data-write') + id);
  menu.attr('data-preview', menu.attr('data-preview') + id);
  menu.find('.item').each(function () {
    const tab = $(this).attr('data-tab') + id;
    $(this).attr('data-tab', tab);
  });
  menu.parent().find("*[data-tab='write']").attr('data-tab', `write${id}`);
  menu.parent().find("*[data-tab='preview']").attr('data-tab', `preview${id}`);
  initCommentPreviewTab(menu.parent('.form'));
  return id;
}

function initRepositoryCollaboration() {
  // Change collaborator access mode
  $('.access-mode.menu .item').on('click', function () {
    const $menu = $(this).parent();
    $.post($menu.data('url'), {
      _csrf: csrf,
      uid: $menu.data('uid'),
      mode: $(this).data('value')
    });
  });
}

function initTeamSettings() {
  // Change team access mode
  $('.organization.new.team input[name=permission]').on('change', () => {
    const val = $('input[name=permission]:checked', '.organization.new.team').val();
    if (val === 'admin') {
      $('.organization.new.team .team-units').hide();
    } else {
      $('.organization.new.team .team-units').show();
    }
  });
}

function initWikiForm() {
  const $editArea = $('.repository.wiki textarea#edit_area');
  let sideBySideChanges = 0;
  let sideBySideTimeout = null;
  if ($editArea.length > 0) {
    const simplemde = new SimpleMDE({
      autoDownloadFontAwesome: false,
      element: $editArea[0],
      forceSync: true,
      previewRender(plainText, preview) { // Async method
        setTimeout(() => {
          // FIXME: still send render request when return back to edit mode
          const render = function () {
            sideBySideChanges = 0;
            if (sideBySideTimeout !== null) {
              clearTimeout(sideBySideTimeout);
              sideBySideTimeout = null;
            }
            $.post($editArea.data('url'), {
              _csrf: csrf,
              mode: 'gfm',
              context: $editArea.data('context'),
              text: plainText,
              wiki: true
            }, (data) => {
              preview.innerHTML = `<div class="markdown ui segment">${data}</div>`;
              $(preview).find('pre code').each((_, e) => {
                highlight(e);
              });
            });
          };
          if (!simplemde.isSideBySideActive()) {
            render();
          } else {
            // delay preview by keystroke counting
            sideBySideChanges++;
            if (sideBySideChanges > 10) {
              render();
            }
            // or delay preview by timeout
            if (sideBySideTimeout !== null) {
              clearTimeout(sideBySideTimeout);
              sideBySideTimeout = null;
            }
            sideBySideTimeout = setTimeout(render, 600);
          }
        }, 0);
        if (!simplemde.isSideBySideActive()) {
          return 'Loading...';
        }
        return preview.innerHTML;
      },
      renderingConfig: {
        singleLineBreaks: false
      },
      indentWithTabs: false,
      tabSize: 4,
      spellChecker: false,
      toolbar: ['bold', 'italic', 'strikethrough', '|',
        'heading-1', 'heading-2', 'heading-3', 'heading-bigger', 'heading-smaller', '|',
        {
          name: 'code-inline',
          action(e) {
            const cm = e.codemirror;
            const selection = cm.getSelection();
            cm.replaceSelection(`\`${selection}\``);
            if (!selection) {
              const cursorPos = cm.getCursor();
              cm.setCursor(cursorPos.line, cursorPos.ch - 1);
            }
            cm.focus();
          },
          className: 'fa fa-angle-right',
          title: 'Add Inline Code',
        }, 'code', 'quote', '|', {
          name: 'checkbox-empty',
          action(e) {
            const cm = e.codemirror;
            cm.replaceSelection(`\n- [ ] ${cm.getSelection()}`);
            cm.focus();
          },
          className: 'fa fa-square-o',
          title: 'Add Checkbox (empty)',
        },
        {
          name: 'checkbox-checked',
          action(e) {
            const cm = e.codemirror;
            cm.replaceSelection(`\n- [x] ${cm.getSelection()}`);
            cm.focus();
          },
          className: 'fa fa-check-square-o',
          title: 'Add Checkbox (checked)',
        }, '|',
        'unordered-list', 'ordered-list', '|',
        'link', 'image', 'table', 'horizontal-rule', '|',
        'clean-block', 'preview', 'fullscreen', 'side-by-side', '|',
        {
          name: 'revert-to-textarea',
          action(e) {
            e.toTextArea();
          },
          className: 'fa fa-file',
          title: 'Revert to simple textarea',
        },
      ]
    });
    $(simplemde.codemirror.getInputField()).addClass('js-quick-submit');

    setTimeout(() => {
      const $bEdit = $('.repository.wiki.new .previewtabs a[data-tab="write"]');
      const $bPrev = $('.repository.wiki.new .previewtabs a[data-tab="preview"]');
      const $toolbar = $('.editor-toolbar');
      const $bPreview = $('.editor-toolbar a.fa-eye');
      const $bSideBySide = $('.editor-toolbar a.fa-columns');
      $bEdit.on('click', () => {
        if ($toolbar.hasClass('disabled-for-preview')) {
          $bPreview.trigger('click');
        }
      });
      $bPrev.on('click', () => {
        if (!$toolbar.hasClass('disabled-for-preview')) {
          $bPreview.trigger('click');
        }
      });
      $bPreview.on('click', () => {
        setTimeout(() => {
          if ($toolbar.hasClass('disabled-for-preview')) {
            if ($bEdit.hasClass('active')) {
              $bEdit.removeClass('active');
            }
            if (!$bPrev.hasClass('active')) {
              $bPrev.addClass('active');
            }
          } else {
            if (!$bEdit.hasClass('active')) {
              $bEdit.addClass('active');
            }
            if ($bPrev.hasClass('active')) {
              $bPrev.removeClass('active');
            }
          }
        }, 0);
      });
      $bSideBySide.on('click', () => {
        sideBySideChanges = 10;
      });
    }, 0);
  }
}

// Adding function to get the cursor position in a text field to jQuery object.
$.fn.getCursorPosition = function () {
  const el = $(this).get(0);
  let pos = 0;
  if ('selectionStart' in el) {
    pos = el.selectionStart;
  } else if ('selection' in document) {
    el.focus();
    const Sel = document.selection.createRange();
    const SelLength = document.selection.createRange().text.length;
    Sel.moveStart('character', -el.value.length);
    pos = Sel.text.length - SelLength;
  }
  return pos;
};

function setCommentSimpleMDE($editArea) {
  const simplemde = new SimpleMDE({
    autoDownloadFontAwesome: false,
    element: $editArea[0],
    forceSync: true,
    renderingConfig: {
      singleLineBreaks: false
    },
    indentWithTabs: false,
    tabSize: 4,
    spellChecker: false,
    toolbar: ['bold', 'italic', 'strikethrough', '|',
      'heading-1', 'heading-2', 'heading-3', 'heading-bigger', 'heading-smaller', '|',
      'code', 'quote', '|',
      'unordered-list', 'ordered-list', '|',
      'link', 'image', 'table', 'horizontal-rule', '|',
      'clean-block', '|',
      {
        name: 'revert-to-textarea',
        action(e) {
          e.toTextArea();
        },
        className: 'fa fa-file',
        title: 'Revert to simple textarea',
      },
    ]
  });
  $(simplemde.codemirror.getInputField()).addClass('js-quick-submit');
  simplemde.codemirror.setOption('extraKeys', {
    Enter: () => {
      if (!(issuesTribute.isActive || emojiTribute.isActive)) {
        return CodeMirror.Pass;
      }
    },
    Backspace: (cm) => {
      if (cm.getInputField().trigger) {
        cm.getInputField().trigger('input');
      }
      cm.execCommand('delCharBefore');
    }
  });
  issuesTribute.attach(simplemde.codemirror.getInputField());
  emojiTribute.attach(simplemde.codemirror.getInputField());
  return simplemde;
}

async function initEditor() {
  $('.js-quick-pull-choice-option').on('change', function () {
    if ($(this).val() === 'commit-to-new-branch') {
      $('.quick-pull-branch-name').show();
      $('.quick-pull-branch-name input').prop('required', true);
    } else {
      $('.quick-pull-branch-name').hide();
      $('.quick-pull-branch-name input').prop('required', false);
    }
    $('#commit-button').text($(this).attr('button_text'));
  });

  const $editFilename = $('#file-name');
  $editFilename.on('keyup', function (e) {
    const $section = $('.breadcrumb span.section');
    const $divider = $('.breadcrumb div.divider');
    let value;
    let parts;

    if (e.keyCode === 8) {
      if ($(this).getCursorPosition() === 0) {
        if ($section.length > 0) {
          value = $section.last().find('a').text();
          $(this).val(value + $(this).val());
          $(this)[0].setSelectionRange(value.length, value.length);
          $section.last().remove();
          $divider.last().remove();
        }
      }
    }
    if (e.keyCode === 191) {
      parts = $(this).val().split('/');
      for (let i = 0; i < parts.length; ++i) {
        value = parts[i];
        if (i < parts.length - 1) {
          if (value.length) {
            $(`<span class="section"><a href="#">${value}</a></span>`).insertBefore($(this));
            $('<div class="divider"> / </div>').insertBefore($(this));
          }
        } else {
          $(this).val(value);
        }
        $(this)[0].setSelectionRange(0, 0);
      }
    }
    parts = [];
    $('.breadcrumb span.section').each(function () {
      const element = $(this);
      if (element.find('a').length) {
        parts.push(element.find('a').text());
      } else {
        parts.push(element.text());
      }
    });
    if ($(this).val()) parts.push($(this).val());
    $('#tree_path').val(parts.join('/'));
  }).trigger('keyup');

  const $editArea = $('.repository.editor textarea#edit_area');
  if (!$editArea.length) return;

  await createCodeEditor($editArea[0], $editFilename[0], previewFileModes);

  // Using events from https://github.com/codedance/jquery.AreYouSure#advanced-usage
  // to enable or disable the commit button
  const $commitButton = $('#commit-button');
  const $editForm = $('.ui.edit.form');
  const dirtyFileClass = 'dirty-file';

  // Disabling the button at the start
  $commitButton.prop('disabled', true);

  // Registering a custom listener for the file path and the file content
  $editForm.areYouSure({
    silent: true,
    dirtyClass: dirtyFileClass,
    fieldSelector: ':input:not(.commit-form-wrapper :input)',
    change() {
      const dirty = $(this).hasClass(dirtyFileClass);
      $commitButton.prop('disabled', !dirty);
    }
  });

  $commitButton.on('click', (event) => {
    // A modal which asks if an empty file should be committed
    if ($editArea.val().length === 0) {
      $('#edit-empty-content-modal').modal({
        onApprove() {
          $('.edit.form').trigger('submit');
        }
      }).modal('show');
      event.preventDefault();
    }
  });
}

function initOrganization() {
  if ($('.organization').length === 0) {
    return;
  }

  // Options
  if ($('.organization.settings.options').length > 0) {
    $('#org_name').on('keyup', function () {
      const $prompt = $('#org-name-change-prompt');
      if ($(this).val().toString().toLowerCase() !== $(this).data('org-name').toString().toLowerCase()) {
        $prompt.show();
      } else {
        $prompt.hide();
      }
    });
  }

  // Labels
  if ($('.organization.settings.labels').length > 0) {
    initLabelEdit();
  }
}

function initUserSettings() {
  // Options
  if ($('.user.settings.profile').length > 0) {
    $('#username').on('keyup', function () {
      const $prompt = $('#name-change-prompt');
      if ($(this).val().toString().toLowerCase() !== $(this).data('name').toString().toLowerCase()) {
        $prompt.show();
      } else {
        $prompt.hide();
      }
    });
  }
}

function initGithook() {
  if ($('.edit.githook').length === 0) {
    return;
  }

  CodeMirror.autoLoadMode(CodeMirror.fromTextArea($('#content')[0], {
    lineNumbers: true,
    mode: 'shell'
  }), 'shell');
}

function initWebhook() {
  if ($('.new.webhook').length === 0) {
    return;
  }

  $('.events.checkbox input').on('change', function () {
    if ($(this).is(':checked')) {
      $('.events.fields').show();
    }
  });
  $('.non-events.checkbox input').on('change', function () {
    if ($(this).is(':checked')) {
      $('.events.fields').hide();
    }
  });

  const updateContentType = function () {
    const visible = $('#http_method').val() === 'POST';
    $('#content_type').parent().parent()[visible ? 'show' : 'hide']();
  };
  updateContentType();
  $('#http_method').on('change', () => {
    updateContentType();
  });

  // Test delivery
  $('#test-delivery').on('click', function () {
    const $this = $(this);
    $this.addClass('loading disabled');
    $.post($this.data('link'), {
      _csrf: csrf
    }).done(
      setTimeout(() => {
        window.location.href = $this.data('redirect');
      }, 5000)
    );
  });
}

function initAdmin() {
  if ($('.admin').length === 0) {
    return;
  }

  // New user
  if ($('.admin.new.user').length > 0 || $('.admin.edit.user').length > 0) {
    $('#login_type').on('change', function () {
      if ($(this).val().substring(0, 1) === '0') {
        $('#login_name').removeAttr('required');
        $('.non-local').hide();
        $('.local').show();
        $('#user_name').focus();

        if ($(this).data('password') === 'required') {
          $('#password').attr('required', 'required');
        }
      } else {
        $('#login_name').attr('required', 'required');
        $('.non-local').show();
        $('.local').hide();
        $('#login_name').focus();

        $('#password').removeAttr('required');
      }
    });
  }

  function onSecurityProtocolChange() {
    if ($('#security_protocol').val() > 0) {
      $('.has-tls').show();
    } else {
      $('.has-tls').hide();
    }
  }

  function onUsePagedSearchChange() {
    if ($('#use_paged_search').prop('checked')) {
      $('.search-page-size').show()
        .find('input').attr('required', 'required');
    } else {
      $('.search-page-size').hide()
        .find('input').removeAttr('required');
    }
  }

  function onOAuth2Change() {
    $('.open_id_connect_auto_discovery_url, .oauth2_use_custom_url').hide();
    $('.open_id_connect_auto_discovery_url input[required]').removeAttr('required');

    const provider = $('#oauth2_provider').val();
    switch (provider) {
      case 'github':
      case 'gitlab':
      case 'gitea':
      case 'nextcloud':
        $('.oauth2_use_custom_url').show();
        break;
      case 'openidConnect':
        $('.open_id_connect_auto_discovery_url input').attr('required', 'required');
        $('.open_id_connect_auto_discovery_url').show();
        break;
    }
    onOAuth2UseCustomURLChange();
  }

  function onOAuth2UseCustomURLChange() {
    const provider = $('#oauth2_provider').val();
    $('.oauth2_use_custom_url_field').hide();
    $('.oauth2_use_custom_url_field input[required]').removeAttr('required');

    if ($('#oauth2_use_custom_url').is(':checked')) {
      $('#oauth2_token_url').val($(`#${provider}_token_url`).val());
      $('#oauth2_auth_url').val($(`#${provider}_auth_url`).val());
      $('#oauth2_profile_url').val($(`#${provider}_profile_url`).val());
      $('#oauth2_email_url').val($(`#${provider}_email_url`).val());

      switch (provider) {
        case 'github':
          $('.oauth2_token_url input, .oauth2_auth_url input, .oauth2_profile_url input, .oauth2_email_url input').attr('required', 'required');
          $('.oauth2_token_url, .oauth2_auth_url, .oauth2_profile_url, .oauth2_email_url').show();
          break;
        case 'nextcloud':
        case 'gitea':
        case 'gitlab':
          $('.oauth2_token_url input, .oauth2_auth_url input, .oauth2_profile_url input').attr('required', 'required');
          $('.oauth2_token_url, .oauth2_auth_url, .oauth2_profile_url').show();
          $('#oauth2_email_url').val('');
          break;
      }
    }
  }

  // New authentication
  if ($('.admin.new.authentication').length > 0) {
    $('#auth_type').on('change', function () {
      $('.ldap, .dldap, .smtp, .pam, .oauth2, .has-tls, .search-page-size, .sspi').hide();

      $('.ldap input[required], .binddnrequired input[required], .dldap input[required], .smtp input[required], .pam input[required], .oauth2 input[required], .has-tls input[required], .sspi input[required]').removeAttr('required');
      $('.binddnrequired').removeClass('required');

      const authType = $(this).val();
      switch (authType) {
        case '2': // LDAP
          $('.ldap').show();
          $('.binddnrequired input, .ldap div.required:not(.dldap) input').attr('required', 'required');
          $('.binddnrequired').addClass('required');
          break;
        case '3': // SMTP
          $('.smtp').show();
          $('.has-tls').show();
          $('.smtp div.required input, .has-tls').attr('required', 'required');
          break;
        case '4': // PAM
          $('.pam').show();
          $('.pam input').attr('required', 'required');
          break;
        case '5': // LDAP
          $('.dldap').show();
          $('.dldap div.required:not(.ldap) input').attr('required', 'required');
          break;
        case '6': // OAuth2
          $('.oauth2').show();
          $('.oauth2 div.required:not(.oauth2_use_custom_url,.oauth2_use_custom_url_field,.open_id_connect_auto_discovery_url) input').attr('required', 'required');
          onOAuth2Change();
          break;
        case '7': // SSPI
          $('.sspi').show();
          $('.sspi div.required input').attr('required', 'required');
          break;
      }
      if (authType === '2' || authType === '5') {
        onSecurityProtocolChange();
      }
      if (authType === '2') {
        onUsePagedSearchChange();
      }
    });
    $('#auth_type').trigger('change');
    $('#security_protocol').on('change', onSecurityProtocolChange);
    $('#use_paged_search').on('change', onUsePagedSearchChange);
    $('#oauth2_provider').on('change', onOAuth2Change);
    $('#oauth2_use_custom_url').on('change', onOAuth2UseCustomURLChange);
  }
  // Edit authentication
  if ($('.admin.edit.authentication').length > 0) {
    const authType = $('#auth_type').val();
    if (authType === '2' || authType === '5') {
      $('#security_protocol').on('change', onSecurityProtocolChange);
      if (authType === '2') {
        $('#use_paged_search').on('change', onUsePagedSearchChange);
      }
    } else if (authType === '6') {
      $('#oauth2_provider').on('change', onOAuth2Change);
      $('#oauth2_use_custom_url').on('change', onOAuth2UseCustomURLChange);
      onOAuth2Change();
    }
  }

  // Notice
  if ($('.admin.notice')) {
    const $detailModal = $('#detail-modal');

    // Attach view detail modals
    $('.view-detail').on('click', function () {
      $detailModal.find('.content pre').text($(this).parents('tr').find('.notice-description').text());
      $detailModal.find('.sub.header').text($(this).parents('tr').find('.notice-created-time').text());
      $detailModal.modal('show');
      return false;
    });

    // Select actions
    const $checkboxes = $('.select.table .ui.checkbox');
    $('.select.action').on('click', function () {
      switch ($(this).data('action')) {
        case 'select-all':
          $checkboxes.checkbox('check');
          break;
        case 'deselect-all':
          $checkboxes.checkbox('uncheck');
          break;
        case 'inverse':
          $checkboxes.checkbox('toggle');
          break;
      }
    });
    $('#delete-selection').on('click', function () {
      const $this = $(this);
      $this.addClass('loading disabled');
      const ids = [];
      $checkboxes.each(function () {
        if ($(this).checkbox('is checked')) {
          ids.push($(this).data('id'));
        }
      });
      $.post($this.data('link'), {
        _csrf: csrf,
        ids
      }).done(() => {
        window.location.href = $this.data('redirect');
      });
    });
  }
}

function buttonsClickOnEnter() {
  $('.ui.button').on('keypress', function (e) {
    if (e.keyCode === 13 || e.keyCode === 32) { // enter key or space bar
      $(this).trigger('click');
    }
  });
}

function searchUsers() {
  const $searchUserBox = $('#search-user-box');
  $searchUserBox.search({
    minCharacters: 2,
    apiSettings: {
      url: `${AppSubUrl}/api/v1/users/search?q={query}`,
      onResponse(response) {
        const items = [];
        $.each(response.data, (_i, item) => {
          let title = item.login;
          if (item.full_name && item.full_name.length > 0) {
            title += ` (${htmlEscape(item.full_name)})`;
          }
          items.push({
            title,
            image: item.avatar_url
          });
        });

        return {results: items};
      }
    },
    searchFields: ['login', 'full_name'],
    showNoResults: false
  });
}

function searchTeams() {
  const $searchTeamBox = $('#search-team-box');
  $searchTeamBox.search({
    minCharacters: 2,
    apiSettings: {
      url: `${AppSubUrl}/api/v1/orgs/${$searchTeamBox.data('org')}/teams/search?q={query}`,
      headers: {'X-Csrf-Token': csrf},
      onResponse(response) {
        const items = [];
        $.each(response.data, (_i, item) => {
          const title = `${item.name} (${item.permission} access)`;
          items.push({
            title,
          });
        });

        return {results: items};
      }
    },
    searchFields: ['name', 'description'],
    showNoResults: false
  });
}

function searchRepositories() {
  const $searchRepoBox = $('#search-repo-box');
  $searchRepoBox.search({
    minCharacters: 2,
    apiSettings: {
      url: `${AppSubUrl}/api/v1/repos/search?q={query}&uid=${$searchRepoBox.data('uid')}`,
      onResponse(response) {
        const items = [];
        $.each(response.data, (_i, item) => {
          items.push({
            title: item.full_name.split('/')[1],
            description: item.full_name
          });
        });

        return {results: items};
      }
    },
    searchFields: ['full_name'],
    showNoResults: false
  });
}

function initCodeView() {
  if ($('.code-view .linenums').length > 0) {
    $(document).on('click', '.lines-num span', function (e) {
      const $select = $(this);
      const $list = $select.parent().siblings('.lines-code').find('ol.linenums > li');
      selectRange($list, $list.filter(`[rel=${$select.attr('id')}]`), (e.shiftKey ? $list.filter('.active').eq(0) : null));
      deSelect();
    });

    $(window).on('hashchange', () => {
      let m = window.location.hash.match(/^#(L\d+)-(L\d+)$/);
      const $list = $('.code-view ol.linenums > li');
      let $first;
      if (m) {
        $first = $list.filter(`.${m[1]}`);
        selectRange($list, $first, $list.filter(`.${m[2]}`));
        $('html, body').scrollTop($first.offset().top - 200);
        return;
      }
      m = window.location.hash.match(/^#(L|n)(\d+)$/);
      if (m) {
        $first = $list.filter(`.L${m[2]}`);
        selectRange($list, $first);
        $('html, body').scrollTop($first.offset().top - 200);
      }
    }).trigger('hashchange');
  }
  $('.fold-code').on('click', ({target}) => {
    const box = target.closest('.file-content');
    const folded = box.dataset.folded !== 'true';
    target.classList.add(`fa-chevron-${folded ? 'right' : 'down'}`);
    target.classList.remove(`fa-chevron-${folded ? 'down' : 'right'}`);
    box.dataset.folded = String(folded);
  });
  function insertBlobExcerpt(e) {
    const $blob = $(e.target);
    const $row = $blob.parent().parent();
    $.get(`${$blob.data('url')}?${$blob.data('query')}&anchor=${$blob.data('anchor')}`, (blob) => {
      $row.replaceWith(blob);
      $(`[data-anchor="${$blob.data('anchor')}"]`).on('click', (e) => { insertBlobExcerpt(e) });
      $('.diff-detail-box.ui.sticky').sticky();
    });
  }
  $('.ui.blob-excerpt').on('click', (e) => { insertBlobExcerpt(e) });
}

function initU2FAuth() {
  if ($('#wait-for-key').length === 0) {
    return;
  }
  u2fApi.ensureSupport()
    .then(() => {
      $.getJSON(`${AppSubUrl}/user/u2f/challenge`).done((req) => {
        u2fApi.sign(req.appId, req.challenge, req.registeredKeys, 30)
          .then(u2fSigned)
          .catch((err) => {
            if (err === undefined) {
              u2fError(1);
              return;
            }
            u2fError(err.metaData.code);
          });
      });
    }).catch(() => {
      // Fallback in case browser do not support U2F
      window.location.href = `${AppSubUrl}/user/two_factor`;
    });
}
function u2fSigned(resp) {
  $.ajax({
    url: `${AppSubUrl}/user/u2f/sign`,
    type: 'POST',
    headers: {'X-Csrf-Token': csrf},
    data: JSON.stringify(resp),
    contentType: 'application/json; charset=utf-8',
  }).done((res) => {
    window.location.replace(res);
  }).fail(() => {
    u2fError(1);
  });
}

function u2fRegistered(resp) {
  if (checkError(resp)) {
    return;
  }
  $.ajax({
    url: `${AppSubUrl}/user/settings/security/u2f/register`,
    type: 'POST',
    headers: {'X-Csrf-Token': csrf},
    data: JSON.stringify(resp),
    contentType: 'application/json; charset=utf-8',
    success() {
      reload();
    },
    fail() {
      u2fError(1);
    }
  });
}

function checkError(resp) {
  if (!('errorCode' in resp)) {
    return false;
  }
  if (resp.errorCode === 0) {
    return false;
  }
  u2fError(resp.errorCode);
  return true;
}

function u2fError(errorType) {
  const u2fErrors = {
    browser: $('#unsupported-browser'),
    1: $('#u2f-error-1'),
    2: $('#u2f-error-2'),
    3: $('#u2f-error-3'),
    4: $('#u2f-error-4'),
    5: $('.u2f-error-5')
  };
  u2fErrors[errorType].removeClass('hide');

  Object.keys(u2fErrors).forEach((type) => {
    if (type !== errorType) {
      u2fErrors[type].addClass('hide');
    }
  });
  $('#u2f-error').modal('show');
}

function initU2FRegister() {
  $('#register-device').modal({allowMultiple: false});
  $('#u2f-error').modal({allowMultiple: false});
  $('#register-security-key').on('click', (e) => {
    e.preventDefault();
    u2fApi.ensureSupport()
      .then(u2fRegisterRequest)
      .catch(() => {
        u2fError('browser');
      });
  });
}

function u2fRegisterRequest() {
  $.post(`${AppSubUrl}/user/settings/security/u2f/request_register`, {
    _csrf: csrf,
    name: $('#nickname').val()
  }).done((req) => {
    $('#nickname').closest('div.field').removeClass('error');
    $('#register-device').modal('show');
    if (req.registeredKeys === null) {
      req.registeredKeys = [];
    }
    u2fApi.register(req.appId, req.registerRequests, req.registeredKeys, 30)
      .then(u2fRegistered)
      .catch((reason) => {
        if (reason === undefined) {
          u2fError(1);
          return;
        }
        u2fError(reason.metaData.code);
      });
  }).fail((xhr) => {
    if (xhr.status === 409) {
      $('#nickname').closest('div.field').addClass('error');
    }
  });
}

function initWipTitle() {
  $('.title_wip_desc > a').on('click', (e) => {
    e.preventDefault();

    const $issueTitle = $('#issue_title');
    $issueTitle.focus();
    const value = $issueTitle.val().trim().toUpperCase();

    for (const i in wipPrefixes) {
      if (value.startsWith(wipPrefixes[i].toUpperCase())) {
        return;
      }
    }

    $issueTitle.val(`${wipPrefixes[0]} ${$issueTitle.val()}`);
  });
}

function initTemplateSearch() {
  const $repoTemplate = $('#repo_template');
  const checkTemplate = function () {
    const $templateUnits = $('#template_units');
    const $nonTemplate = $('#non_template');
    if ($repoTemplate.val() !== '' && $repoTemplate.val() !== '0') {
      $templateUnits.show();
      $nonTemplate.hide();
    } else {
      $templateUnits.hide();
      $nonTemplate.show();
    }
  };
  $repoTemplate.on('change', checkTemplate);
  checkTemplate();

  const changeOwner = function () {
    $('#repo_template_search')
      .dropdown({
        apiSettings: {
          url: `${AppSubUrl}/api/v1/repos/search?q={query}&template=true&priority_owner_id=${$('#uid').val()}`,
          onResponse(response) {
            const filteredResponse = {success: true, results: []};
            filteredResponse.results.push({
              name: '',
              value: ''
            });
            // Parse the response from the api to work with our dropdown
            $.each(response.data, (_r, repo) => {
              filteredResponse.results.push({
                name: htmlEscape(repo.full_name),
                value: repo.id
              });
            });
            return filteredResponse;
          },
          cache: false,
        },

        fullTextSearch: true
      });
  };
  $('#uid').on('change', changeOwner);
  changeOwner();
}

$(document).ready(async () => {
  // Show exact time
  $('.time-since').each(function () {
    $(this)
      .addClass('poping up')
      .attr('data-content', $(this).attr('title'))
      .attr('data-variation', 'inverted tiny')
      .attr('title', '');
  });

  // Semantic UI modules.
  $('.dropdown:not(.custom)').dropdown();
  $('.jump.dropdown').dropdown({
    action: 'hide',
    onShow() {
      $('.poping.up').popup('hide');
    }
  });
  $('.slide.up.dropdown').dropdown({
    transition: 'slide up'
  });
  $('.upward.dropdown').dropdown({
    direction: 'upward'
  });
  $('.ui.accordion').accordion();
  $('.ui.checkbox').checkbox();
  $('.ui.progress').progress({
    showActivity: false
  });
  $('.poping.up').popup();
  $('.top.menu .poping.up').popup({
    onShow() {
      if ($('.top.menu .menu.transition').hasClass('visible')) {
        return false;
      }
    }
  });
  $('.tabular.menu .item').tab();
  $('.tabable.menu .item').tab();

  $('.toggle.button').on('click', function () {
    $($(this).data('target')).slideToggle(100);
  });

  // make table <tr> element clickable like a link
  $('tr[data-href]').on('click', function () {
    window.location = $(this).data('href');
  });

  // make table <td> element clickable like a link
  $('td[data-href]').click(function () {
    window.location = $(this).data('href');
  });

  // Dropzone
  const $dropzone = $('#dropzone');
  if ($dropzone.length > 0) {
    const filenameDict = {};

    await createDropzone('#dropzone', {
      url: $dropzone.data('upload-url'),
      headers: {'X-Csrf-Token': csrf},
      maxFiles: $dropzone.data('max-file'),
      maxFilesize: $dropzone.data('max-size'),
      acceptedFiles: ($dropzone.data('accepts') === '*/*') ? null : $dropzone.data('accepts'),
      addRemoveLinks: true,
      dictDefaultMessage: $dropzone.data('default-message'),
      dictInvalidFileType: $dropzone.data('invalid-input-type'),
      dictFileTooBig: $dropzone.data('file-too-big'),
      dictRemoveFile: $dropzone.data('remove-file'),
      timeout: 0,
      init() {
        this.on('success', (file, data) => {
          filenameDict[file.name] = data.uuid;
          const input = $(`<input id="${data.uuid}" name="files" type="hidden">`).val(data.uuid);
          $('.files').append(input);
        });
        this.on('removedfile', (file) => {
          if (file.name in filenameDict) {
            $(`#${filenameDict[file.name]}`).remove();
          }
          if ($dropzone.data('remove-url') && $dropzone.data('csrf')) {
            $.post($dropzone.data('remove-url'), {
              file: filenameDict[file.name],
              _csrf: $dropzone.data('csrf')
            });
          }
        });
      },
    });
  }

  // Helpers.
  $('.delete-button').on('click', showDeletePopup);
  $('.add-all-button').on('click', showAddAllPopup);
  $('.link-action').on('click', linkAction);
  $('.link-email-action').on('click', linkEmailAction);

  $('.delete-branch-button').on('click', showDeletePopup);

  $('.undo-button').on('click', function () {
    const $this = $(this);
    $.post($this.data('url'), {
      _csrf: csrf,
      id: $this.data('id')
    }).done((data) => {
      window.location.href = data.redirect;
    });
  });
  $('.show-panel.button').on('click', function () {
    $($(this).data('panel')).show();
  });
  $('.show-modal.button').on('click', function () {
    $($(this).data('modal')).modal('show');
  });
  $('.delete-post.button').on('click', function () {
    const $this = $(this);
    $.post($this.data('request-url'), {
      _csrf: csrf
    }).done(() => {
      window.location.href = $this.data('done-url');
    });
  });

  // Set anchor.
  $('.markdown').each(function () {
    $(this).find('h1, h2, h3, h4, h5, h6').each(function () {
      let node = $(this);
      node = node.wrap('<div class="anchor-wrap"></div>');
      node.append(`<a class="anchor" href="#${encodeURIComponent(node.attr('id'))}">${svg('octicon-link', 16)}</a>`);
    });
  });

  $('.issue-checkbox').on('click', () => {
    const numChecked = $('.issue-checkbox').children('input:checked').length;
    if (numChecked > 0) {
      $('#issue-filters').addClass('hide');
      $('#issue-actions').removeClass('hide');
    } else {
      $('#issue-filters').removeClass('hide');
      $('#issue-actions').addClass('hide');
    }
  });

  $('.issue-action').on('click', function () {
    let {action} = this.dataset;
    let {elementId} = this.dataset;
    const issueIDs = $('.issue-checkbox').children('input:checked').map(function () {
      return this.dataset.issueId;
    }).get().join();
    const {url} = this.dataset;
    if (elementId === '0' && url.substr(-9) === '/assignee') {
      elementId = '';
      action = 'clear';
    }
    updateIssuesMeta(url, action, issueIDs, elementId, '').then(() => {
      // NOTICE: This reset of checkbox state targets Firefox caching behaviour, as the checkboxes stay checked after reload
      if (action === 'close' || action === 'open') {
        // uncheck all checkboxes
        $('.issue-checkbox input[type="checkbox"]').each((_, e) => { e.checked = false });
      }
      reload();
    });
  });

  // NOTICE: This event trigger targets Firefox caching behaviour, as the checkboxes stay checked after reload
  // trigger ckecked event, if checkboxes are checked on load
  $('.issue-checkbox input[type="checkbox"]:checked').first().each((_, e) => {
    e.checked = false;
    $(e).trigger('click');
  });

  $('.resolve-conversation').on('click', function (e) {
    e.preventDefault();
    const id = $(this).data('comment-id');
    const action = $(this).data('action');
    const url = $(this).data('update-url');

    $.post(url, {
      _csrf: csrf,
      action,
      comment_id: id,
    }).then(reload);
  });

  buttonsClickOnEnter();
  searchUsers();
  searchTeams();
  searchRepositories();

  initCommentForm();
  initInstall();
  initRepository();
  initMigration();
  initWikiForm();
  initEditForm();
  initEditor();
  initOrganization();
  initGithook();
  initWebhook();
  initAdmin();
  initCodeView();
  initVueApp();
  initTeamSettings();
  initCtrlEnterSubmit();
  initNavbarContentToggle();
  initTopicbar();
  initU2FAuth();
  initU2FRegister();
  initIssueList();
  initWipTitle();
  initPullRequestReview();
  initRepoStatusChecker();
  initTemplateSearch();
  initContextPopups();
  initNotificationsTable();
  initTribute();

  // Repo clone url.
  if ($('#repo-clone-url').length > 0) {
    switch (localStorage.getItem('repo-clone-protocol')) {
      case 'ssh':
        if ($('#repo-clone-ssh').length > 0) {
          $('#repo-clone-ssh').trigger('click');
        } else {
          $('#repo-clone-https').trigger('click');
        }
        break;
      default:
        $('#repo-clone-https').trigger('click');
        break;
    }
  }

  const routes = {
    'div.user.settings': initUserSettings,
    'div.repository.settings.collaboration': initRepositoryCollaboration
  };

  let selector;
  for (selector in routes) {
    if ($(selector).length > 0) {
      routes[selector]();
      break;
    }
  }

  const $cloneAddr = $('#clone_addr');
  $cloneAddr.on('change', () => {
    const $repoName = $('#repo_name');
    if ($cloneAddr.val().length > 0 && $repoName.val().length === 0) { // Only modify if repo_name input is blank
      $repoName.val($cloneAddr.val().match(/^(.*\/)?((.+?)(\.git)?)$/)[3]);
    }
  });

  // parallel init of async loaded features
  await Promise.all([
    highlight(document.querySelectorAll('pre code')),
    initGitGraph(),
    initClipboard(),
    initUserHeatmap(),
    initServiceWorker(),
    initNotificationCount(),
  ]);
});

function changeHash(hash) {
  if (window.history.pushState) {
    window.history.pushState(null, null, hash);
  } else {
    window.location.hash = hash;
  }
}

function deSelect() {
  if (window.getSelection) {
    window.getSelection().removeAllRanges();
  } else {
    document.selection.empty();
  }
}

function selectRange($list, $select, $from) {
  $list.removeClass('active');
  if ($from) {
    let a = parseInt($select.attr('rel').substr(1));
    let b = parseInt($from.attr('rel').substr(1));
    let c;
    if (a !== b) {
      if (a > b) {
        c = a;
        a = b;
        b = c;
      }
      const classes = [];
      for (let i = a; i <= b; i++) {
        classes.push(`.L${i}`);
      }
      $list.filter(classes.join(',')).addClass('active');
      changeHash(`#L${a}-L${b}`);
      return;
    }
  }
  $select.addClass('active');
  changeHash(`#${$select.attr('rel')}`);
}

$(() => {
  // Warn users that try to leave a page after entering data into a form.
  // Except on sign-in pages, and for forms marked as 'ignore-dirty'.
  if ($('.user.signin').length === 0) {
    $('form:not(.ignore-dirty)').areYouSure();
  }

  // Parse SSH Key
  $('#ssh-key-content').on('change paste keyup', function () {
    const arrays = $(this).val().split(' ');
    const $title = $('#ssh-key-title');
    if ($title.val() === '' && arrays.length === 3 && arrays[2] !== '') {
      $title.val(arrays[2]);
    }
  });
});

function showDeletePopup() {
  const $this = $(this);
  let filter = '';
  if ($this.attr('id')) {
    filter += `#${$this.attr('id')}`;
  }

  const dialog = $(`.delete.modal${filter}`);
  dialog.find('.name').text($this.data('name'));

  dialog.modal({
    closable: false,
    onApprove() {
      if ($this.data('type') === 'form') {
        $($this.data('form')).trigger('submit');
        return;
      }

      $.post($this.data('url'), {
        _csrf: csrf,
        id: $this.data('id')
      }).done((data) => {
        window.location.href = data.redirect;
      });
    }
  }).modal('show');
  return false;
}

function showAddAllPopup() {
  const $this = $(this);
  let filter = '';
  if ($this.attr('id')) {
    filter += `#${$this.attr('id')}`;
  }

  const dialog = $(`.addall.modal${filter}`);
  dialog.find('.name').text($this.data('name'));

  dialog.modal({
    closable: false,
    onApprove() {
      if ($this.data('type') === 'form') {
        $($this.data('form')).trigger('submit');
        return;
      }

      $.post($this.data('url'), {
        _csrf: csrf,
        id: $this.data('id')
      }).done((data) => {
        window.location.href = data.redirect;
      });
    }
  }).modal('show');
  return false;
}

function linkAction(e) {
  e.preventDefault();
  const $this = $(this);
  const redirect = $this.data('redirect');
  $.post($this.data('url'), {
    _csrf: csrf
  }).done((data) => {
    if (data.redirect) {
      window.location.href = data.redirect;
    } else if (redirect) {
      window.location.href = redirect;
    } else {
      window.location.reload();
    }
  });
}

function linkEmailAction(e) {
  const $this = $(this);
  $('#form-uid').val($this.data('uid'));
  $('#form-email').val($this.data('email'));
  $('#form-primary').val($this.data('primary'));
  $('#form-activate').val($this.data('activate'));
  $('#form-uid').val($this.data('uid'));
  $('#change-email-modal').modal('show');
  e.preventDefault();
}

function initVueComponents() {
  const vueDelimeters = ['${', '}'];

  Vue.component('repo-search', {
    delimiters: vueDelimeters,

    props: {
      searchLimit: {
        type: Number,
        default: 10
      },
      suburl: {
        type: String,
        required: true
      },
      uid: {
        type: Number,
        required: true
      },
      organizations: {
        type: Array,
        default: []
      },
      isOrganization: {
        type: Boolean,
        default: true
      },
      canCreateOrganization: {
        type: Boolean,
        default: false
      },
      organizationsTotalCount: {
        type: Number,
        default: 0
      },
      moreReposLink: {
        type: String,
        default: ''
      }
    },

    data() {
      const params = new URLSearchParams(window.location.search);

      let tab = params.get('repo-search-tab');
      if (!tab) {
        tab = 'repos';
      }

      let reposFilter = params.get('repo-search-filter');
      if (!reposFilter) {
        reposFilter = 'all';
      }

      let privateFilter = params.get('repo-search-private');
      if (!privateFilter) {
        privateFilter = 'both';
      }

      let archivedFilter = params.get('repo-search-archived');
      if (!archivedFilter) {
        archivedFilter = 'unarchived';
      }

      let searchQuery = params.get('repo-search-query');
      if (!searchQuery) {
        searchQuery = '';
      }

      let page = 1;
      try {
        page = parseInt(params.get('repo-search-page'));
      } catch {
        // noop
      }
      if (!page) {
        page = 1;
      }

      return {
        tab,
        repos: [],
        reposTotalCount: 0,
        reposFilter,
        archivedFilter,
        privateFilter,
        page,
        finalPage: 1,
        searchQuery,
        isLoading: false,
        staticPrefix: StaticUrlPrefix,
        counts: {},
        repoTypes: {
          all: {
            searchMode: '',
          },
          forks: {
            searchMode: 'fork',
          },
          mirrors: {
            searchMode: 'mirror',
          },
          sources: {
            searchMode: 'source',
          },
          collaborative: {
            searchMode: 'collaborative',
          },
        }
      };
    },

    computed: {
      showMoreReposLink() {
        return this.repos.length > 0 && this.repos.length < this.counts[`${this.reposFilter}:${this.archivedFilter}:${this.privateFilter}`];
      },
      searchURL() {
        return `${this.suburl}/api/v1/repos/search?sort=updated&order=desc&uid=${this.uid}&q=${this.searchQuery
        }&page=${this.page}&limit=${this.searchLimit}&mode=${this.repoTypes[this.reposFilter].searchMode
        }${this.reposFilter !== 'all' ? '&exclusive=1' : ''
        }${this.archivedFilter === 'archived' ? '&archived=true' : ''}${this.archivedFilter === 'unarchived' ? '&archived=false' : ''
        }${this.privateFilter === 'private' ? '&is_private=true' : ''}${this.privateFilter === 'public' ? '&is_private=false' : ''
        }`;
      },
      repoTypeCount() {
        return this.counts[`${this.reposFilter}:${this.archivedFilter}:${this.privateFilter}`];
      }
    },

    mounted() {
      this.searchRepos(this.reposFilter);
      $(this.$el).find('.poping.up').popup();
      $(this.$el).find('.dropdown').dropdown();
      this.setCheckboxes();
      const self = this;
      Vue.nextTick(() => {
        self.$refs.search.focus();
      });
    },

    methods: {
      changeTab(t) {
        this.tab = t;
        this.updateHistory();
      },

      setCheckboxes() {
        switch (this.archivedFilter) {
          case 'unarchived':
            $('#archivedFilterCheckbox').checkbox('set unchecked');
            break;
          case 'archived':
            $('#archivedFilterCheckbox').checkbox('set checked');
            break;
          case 'both':
            $('#archivedFilterCheckbox').checkbox('set indeterminate');
            break;
          default:
            this.archivedFilter = 'unarchived';
            $('#archivedFilterCheckbox').checkbox('set unchecked');
            break;
        }
        switch (this.privateFilter) {
          case 'public':
            $('#privateFilterCheckbox').checkbox('set unchecked');
            break;
          case 'private':
            $('#privateFilterCheckbox').checkbox('set checked');
            break;
          case 'both':
            $('#privateFilterCheckbox').checkbox('set indeterminate');
            break;
          default:
            this.privateFilter = 'both';
            $('#privateFilterCheckbox').checkbox('set indeterminate');
            break;
        }
      },

      changeReposFilter(filter) {
        this.reposFilter = filter;
        this.repos = [];
        this.page = 1;
        Vue.set(this.counts, `${filter}:${this.archivedFilter}:${this.privateFilter}`, 0);
        this.searchRepos();
      },

      updateHistory() {
        const params = new URLSearchParams(window.location.search);

        if (this.tab === 'repos') {
          params.delete('repo-search-tab');
        } else {
          params.set('repo-search-tab', this.tab);
        }

        if (this.reposFilter === 'all') {
          params.delete('repo-search-filter');
        } else {
          params.set('repo-search-filter', this.reposFilter);
        }

        if (this.privateFilter === 'both') {
          params.delete('repo-search-private');
        } else {
          params.set('repo-search-private', this.privateFilter);
        }

        if (this.archivedFilter === 'unarchived') {
          params.delete('repo-search-archived');
        } else {
          params.set('repo-search-archived', this.archivedFilter);
        }

        if (this.searchQuery === '') {
          params.delete('repo-search-query');
        } else {
          params.set('repo-search-query', this.searchQuery);
        }

        if (this.page === 1) {
          params.delete('repo-search-page');
        } else {
          params.set('repo-search-page', `${this.page}`);
        }

        const queryString = params.toString();
        if (queryString) {
          window.history.replaceState({}, '', `?${queryString}`);
        } else {
          window.history.replaceState({}, '', window.location.pathname);
        }
      },

      toggleArchivedFilter() {
        switch (this.archivedFilter) {
          case 'both':
            this.archivedFilter = 'unarchived';
            break;
          case 'unarchived':
            this.archivedFilter = 'archived';
            break;
          case 'archived':
            this.archivedFilter = 'both';
            break;
          default:
            this.archivedFilter = 'unarchived';
            break;
        }
        this.page = 1;
        this.repos = [];
        this.setCheckboxes();
        Vue.set(this.counts, `${this.reposFilter}:${this.archivedFilter}:${this.privateFilter}`, 0);
        this.searchRepos();
      },

      togglePrivateFilter() {
        switch (this.privateFilter) {
          case 'both':
            this.privateFilter = 'public';
            break;
          case 'public':
            this.privateFilter = 'private';
            break;
          case 'private':
            this.privateFilter = 'both';
            break;
          default:
            this.privateFilter = 'both';
            break;
        }
        this.page = 1;
        this.repos = [];
        this.setCheckboxes();
        Vue.set(this.counts, `${this.reposFilter}:${this.archivedFilter}:${this.privateFilter}`, 0);
        this.searchRepos();
      },


      changePage(page) {
        this.page = page;
        if (this.page > this.finalPage) {
          this.page = this.finalPage;
        }
        if (this.page < 1) {
          this.page = 1;
        }
        this.repos = [];
        Vue.set(this.counts, `${this.reposFilter}:${this.archivedFilter}:${this.privateFilter}`, 0);
        this.searchRepos();
      },

      searchRepos() {
        const self = this;

        this.isLoading = true;

        if (!this.reposTotalCount) {
          const totalCountSearchURL = `${this.suburl}/api/v1/repos/search?sort=updated&order=desc&uid=${this.uid}&q=&page=1&mode=`;
          $.getJSON(totalCountSearchURL, (_result, _textStatus, request) => {
            self.reposTotalCount = request.getResponseHeader('X-Total-Count');
          });
        }

        const searchedMode = this.repoTypes[this.reposFilter].searchMode;
        const searchedURL = this.searchURL;
        const searchedQuery = this.searchQuery;

        $.getJSON(searchedURL, (result, _textStatus, request) => {
          if (searchedURL === self.searchURL) {
            self.repos = result.data;
            const count = request.getResponseHeader('X-Total-Count');
            if (searchedQuery === '' && searchedMode === '' && self.archivedFilter === 'both') {
              self.reposTotalCount = count;
            }
            Vue.set(self.counts, `${self.reposFilter}:${self.archivedFilter}:${self.privateFilter}`, count);
            self.finalPage = Math.floor(count / self.searchLimit) + 1;
            self.updateHistory();
          }
        }).always(() => {
          if (searchedURL === self.searchURL) {
            self.isLoading = false;
          }
        });
      },

      repoClass(repo) {
        if (repo.fork) {
          return 'octicon-repo-forked';
        } if (repo.mirror) {
          return 'octicon-repo-clone';
        } if (repo.template) {
          return `octicon-repo-template${repo.private ? '-private' : ''}`;
        } if (repo.private) {
          return 'octicon-lock';
        }
        return 'octicon-repo';
      }
    }
  });
}

function initCtrlEnterSubmit() {
  $('.js-quick-submit').on('keydown', function (e) {
    if (((e.ctrlKey && !e.altKey) || e.metaKey) && (e.keyCode === 13 || e.keyCode === 10)) {
      $(this).closest('form').trigger('submit');
    }
  });
}

function initVueApp() {
  const el = document.getElementById('app');
  if (!el) {
    return;
  }

  initVueComponents();

  new Vue({
    delimiters: ['${', '}'],
    el,
    data: {
      searchLimit: Number((document.querySelector('meta[name=_search_limit]') || {}).content),
      suburl: AppSubUrl,
      uid: Number((document.querySelector('meta[name=_context_uid]') || {}).content),
      activityTopAuthors: window.ActivityTopAuthors || [],
    },
    components: {
      ActivityTopAuthors,
    },
  });
}

window.timeAddManual = function () {
  $('.mini.modal')
    .modal({
      duration: 200,
      onApprove() {
        $('#add_time_manual_form').trigger('submit');
      }
    }).modal('show');
};

window.toggleStopwatch = function () {
  $('#toggle_stopwatch_form').trigger('submit');
};
window.cancelStopwatch = function () {
  $('#cancel_stopwatch_form').trigger('submit');
};

function initFilterBranchTagDropdown(selector) {
  $(selector).each(function () {
    const $dropdown = $(this);
    const $data = $dropdown.find('.data');
    const data = {
      items: [],
      mode: $data.data('mode'),
      searchTerm: '',
      noResults: '',
      canCreateBranch: false,
      menuVisible: false,
      active: 0
    };
    $data.find('.item').each(function () {
      data.items.push({
        name: $(this).text(),
        url: $(this).data('url'),
        branch: $(this).hasClass('branch'),
        tag: $(this).hasClass('tag'),
        selected: $(this).hasClass('selected')
      });
    });
    $data.remove();
    new Vue({
      delimiters: ['${', '}'],
      el: this,
      data,

      beforeMount() {
        const vm = this;

        this.noResults = vm.$el.getAttribute('data-no-results');
        this.canCreateBranch = vm.$el.getAttribute('data-can-create-branch') === 'true';

        document.body.addEventListener('click', (event) => {
          if (vm.$el.contains(event.target)) {
            return;
          }
          if (vm.menuVisible) {
            Vue.set(vm, 'menuVisible', false);
          }
        });
      },

      watch: {
        menuVisible(visible) {
          if (visible) {
            this.focusSearchField();
          }
        }
      },

      computed: {
        filteredItems() {
          const vm = this;

          const items = vm.items.filter((item) => {
            return ((vm.mode === 'branches' && item.branch) || (vm.mode === 'tags' && item.tag)) &&
              (!vm.searchTerm || item.name.toLowerCase().includes(vm.searchTerm.toLowerCase()));
          });

          vm.active = (items.length === 0 && vm.showCreateNewBranch ? 0 : -1);

          return items;
        },
        showNoResults() {
          return this.filteredItems.length === 0 && !this.showCreateNewBranch;
        },
        showCreateNewBranch() {
          const vm = this;
          if (!this.canCreateBranch || !vm.searchTerm || vm.mode === 'tags') {
            return false;
          }

          return vm.items.filter((item) => item.name.toLowerCase() === vm.searchTerm.toLowerCase()).length === 0;
        }
      },

      methods: {
        selectItem(item) {
          const prev = this.getSelected();
          if (prev !== null) {
            prev.selected = false;
          }
          item.selected = true;
          window.location.href = item.url;
        },
        createNewBranch() {
          if (!this.showCreateNewBranch) {
            return;
          }
          $(this.$refs.newBranchForm).trigger('submit');
        },
        focusSearchField() {
          const vm = this;
          Vue.nextTick(() => {
            vm.$refs.searchField.focus();
          });
        },
        getSelected() {
          for (let i = 0, j = this.items.length; i < j; ++i) {
            if (this.items[i].selected) return this.items[i];
          }
          return null;
        },
        getSelectedIndexInFiltered() {
          for (let i = 0, j = this.filteredItems.length; i < j; ++i) {
            if (this.filteredItems[i].selected) return i;
          }
          return -1;
        },
        scrollToActive() {
          let el = this.$refs[`listItem${this.active}`];
          if (!el || el.length === 0) {
            return;
          }
          if (Array.isArray(el)) {
            el = el[0];
          }

          const cont = this.$refs.scrollContainer;

          if (el.offsetTop < cont.scrollTop) {
            cont.scrollTop = el.offsetTop;
          } else if (el.offsetTop + el.clientHeight > cont.scrollTop + cont.clientHeight) {
            cont.scrollTop = el.offsetTop + el.clientHeight - cont.clientHeight;
          }
        },
        keydown(event) {
          const vm = this;
          if (event.keyCode === 40) {
            // arrow down
            event.preventDefault();

            if (vm.active === -1) {
              vm.active = vm.getSelectedIndexInFiltered();
            }

            if (vm.active + (vm.showCreateNewBranch ? 0 : 1) >= vm.filteredItems.length) {
              return;
            }
            vm.active++;
            vm.scrollToActive();
          }
          if (event.keyCode === 38) {
            // arrow up
            event.preventDefault();

            if (vm.active === -1) {
              vm.active = vm.getSelectedIndexInFiltered();
            }

            if (vm.active <= 0) {
              return;
            }
            vm.active--;
            vm.scrollToActive();
          }
          if (event.keyCode === 13) {
            // enter
            event.preventDefault();

            if (vm.active >= vm.filteredItems.length) {
              vm.createNewBranch();
            } else if (vm.active >= 0) {
              vm.selectItem(vm.filteredItems[vm.active]);
            }
          }
          if (event.keyCode === 27) {
            // escape
            event.preventDefault();
            vm.menuVisible = false;
          }
        }
      }
    });
  });
}

$('.commit-button').on('click', function (e) {
  e.preventDefault();
  $(this).parent().find('.commit-body').toggle();
});

function initNavbarContentToggle() {
  const content = $('#navbar');
  const toggle = $('#navbar-expand-toggle');
  let isExpanded = false;
  toggle.on('click', () => {
    isExpanded = !isExpanded;
    if (isExpanded) {
      content.addClass('shown');
      toggle.addClass('active');
    } else {
      content.removeClass('shown');
      toggle.removeClass('active');
    }
  });
}

function initTopicbar() {
  const mgrBtn = $('#manage_topic');
  const editDiv = $('#topic_edit');
  const viewDiv = $('#repo-topics');
  const saveBtn = $('#save_topic');
  const topicDropdown = $('#topic_edit .dropdown');
  const topicForm = $('#topic_edit.ui.form');
  const topicPrompts = getPrompts();

  mgrBtn.on('click', () => {
    viewDiv.hide();
    editDiv.css('display', ''); // show Semantic UI Grid
  });

  function getPrompts() {
    const hidePrompt = $('div.hide#validate_prompt');
    const prompts = {
      countPrompt: hidePrompt.children('#count_prompt').text(),
      formatPrompt: hidePrompt.children('#format_prompt').text()
    };
    hidePrompt.remove();
    return prompts;
  }

  saveBtn.on('click', () => {
    const topics = $('input[name=topics]').val();

    $.post(saveBtn.data('link'), {
      _csrf: csrf,
      topics
    }, (_data, _textStatus, xhr) => {
      if (xhr.responseJSON.status === 'ok') {
        viewDiv.children('.topic').remove();
        if (topics.length) {
          const topicArray = topics.split(',');

          const last = viewDiv.children('a').last();
          for (let i = 0; i < topicArray.length; i++) {
            const link = $('<a class="ui repo-topic small label topic"></a>');
            link.attr('href', `${AppSubUrl}/explore/repos?q=${encodeURIComponent(topicArray[i])}&topic=1`);
            link.text(topicArray[i]);
            link.insertBefore(last);
          }
        }
        editDiv.css('display', 'none');
        viewDiv.show();
      }
    }).fail((xhr) => {
      if (xhr.status === 422) {
        if (xhr.responseJSON.invalidTopics.length > 0) {
          topicPrompts.formatPrompt = xhr.responseJSON.message;

          const {invalidTopics} = xhr.responseJSON;
          const topicLables = topicDropdown.children('a.ui.label');

          topics.split(',').forEach((value, index) => {
            for (let i = 0; i < invalidTopics.length; i++) {
              if (invalidTopics[i] === value) {
                topicLables.eq(index).removeClass('green').addClass('red');
              }
            }
          });
        } else {
          topicPrompts.countPrompt = xhr.responseJSON.message;
        }
      }
    }).always(() => {
      topicForm.form('validate form');
    });
  });

  topicDropdown.dropdown({
    allowAdditions: true,
    forceSelection: false,
    fields: {name: 'description', value: 'data-value'},
    saveRemoteData: false,
    label: {
      transition: 'horizontal flip',
      duration: 200,
      variation: false,
      blue: true,
      basic: true,
    },
    className: {
      label: 'ui small label'
    },
    apiSettings: {
      url: `${AppSubUrl}/api/v1/topics/search?q={query}`,
      throttle: 500,
      cache: false,
      onResponse(res) {
        const formattedResponse = {
          success: false,
          results: [],
        };
        const stripTags = function (text) {
          return text.replace(/<[^>]*>?/gm, '');
        };

        const query = stripTags(this.urlData.query.trim());
        let found_query = false;
        const current_topics = [];
        topicDropdown.find('div.label.visible.topic,a.label.visible').each((_, e) => { current_topics.push(e.dataset.value) });

        if (res.topics) {
          let found = false;
          for (let i = 0; i < res.topics.length; i++) {
            // skip currently added tags
            if (current_topics.includes(res.topics[i].topic_name)) {
              continue;
            }

            if (res.topics[i].topic_name.toLowerCase() === query.toLowerCase()) {
              found_query = true;
            }
            formattedResponse.results.push({description: res.topics[i].topic_name, 'data-value': res.topics[i].topic_name});
            found = true;
          }
          formattedResponse.success = found;
        }

        if (query.length > 0 && !found_query) {
          formattedResponse.success = true;
          formattedResponse.results.unshift({description: query, 'data-value': query});
        } else if (query.length > 0 && found_query) {
          formattedResponse.results.sort((a, b) => {
            if (a.description.toLowerCase() === query.toLowerCase()) return -1;
            if (b.description.toLowerCase() === query.toLowerCase()) return 1;
            if (a.description > b.description) return -1;
            if (a.description < b.description) return 1;
            return 0;
          });
        }

        return formattedResponse;
      },
    },
    onLabelCreate(value) {
      value = value.toLowerCase().trim();
      this.attr('data-value', value).contents().first().replaceWith(value);
      return $(this);
    },
    onAdd(addedValue, _addedText, $addedChoice) {
      addedValue = addedValue.toLowerCase().trim();
      $($addedChoice).attr('data-value', addedValue);
      $($addedChoice).attr('data-text', addedValue);
    }
  });

  $.fn.form.settings.rules.validateTopic = function (_values, regExp) {
    const topics = topicDropdown.children('a.ui.label');
    const status = topics.length === 0 || topics.last().attr('data-value').match(regExp);
    if (!status) {
      topics.last().removeClass('green').addClass('red');
    }
    return status && topicDropdown.children('a.ui.label.red').length === 0;
  };

  topicForm.form({
    on: 'change',
    inline: true,
    fields: {
      topics: {
        identifier: 'topics',
        rules: [
          {
            type: 'validateTopic',
            value: /^[a-z0-9][a-z0-9-]{0,35}$/,
            prompt: topicPrompts.formatPrompt
          },
          {
            type: 'maxCount[25]',
            prompt: topicPrompts.countPrompt
          }
        ]
      },
    }
  });
}

window.toggleDeadlineForm = function () {
  $('#deadlineForm').fadeToggle(150);
};

window.setDeadline = function () {
  const deadline = $('#deadlineDate').val();
  window.updateDeadline(deadline);
};

window.updateDeadline = function (deadlineString) {
  $('#deadline-err-invalid-date').hide();
  $('#deadline-loader').addClass('loading');

  let realDeadline = null;
  if (deadlineString !== '') {
    const newDate = Date.parse(deadlineString);

    if (Number.isNaN(newDate)) {
      $('#deadline-loader').removeClass('loading');
      $('#deadline-err-invalid-date').show();
      return false;
    }
    realDeadline = new Date(newDate);
  }

  $.ajax(`${$('#update-issue-deadline-form').attr('action')}/deadline`, {
    data: JSON.stringify({
      due_date: realDeadline,
    }),
    headers: {
      'X-Csrf-Token': csrf,
      'X-Remote': true,
    },
    contentType: 'application/json',
    type: 'POST',
    success() {
      reload();
    },
    error() {
      $('#deadline-loader').removeClass('loading');
      $('#deadline-err-invalid-date').show();
    }
  });
};

window.deleteDependencyModal = function (id, type) {
  $('.remove-dependency')
    .modal({
      closable: false,
      duration: 200,
      onApprove() {
        $('#removeDependencyID').val(id);
        $('#dependencyType').val(type);
        $('#removeDependencyForm').trigger('submit');
      }
    }).modal('show');
};

function initIssueList() {
  const repolink = $('#repolink').val();
  const repoId = $('#repoId').val();
  const crossRepoSearch = $('#crossRepoSearch').val();
  const tp = $('#type').val();
  let issueSearchUrl = `${AppSubUrl}/api/v1/repos/${repolink}/issues?q={query}&type=${tp}`;
  if (crossRepoSearch === 'true') {
    issueSearchUrl = `${AppSubUrl}/api/v1/repos/issues/search?q={query}&priority_repo_id=${repoId}&type=${tp}`;
  }
  $('#new-dependency-drop-list')
    .dropdown({
      apiSettings: {
        url: issueSearchUrl,
        onResponse(response) {
          const filteredResponse = {success: true, results: []};
          const currIssueId = $('#new-dependency-drop-list').data('issue-id');
          // Parse the response from the api to work with our dropdown
          $.each(response, (_i, issue) => {
            // Don't list current issue in the dependency list.
            if (issue.id === currIssueId) {
              return;
            }
            filteredResponse.results.push({
              name: `#${issue.number} ${htmlEscape(issue.title)
              }<div class="text small dont-break-out">${htmlEscape(issue.repository.full_name)}</div>`,
              value: issue.id
            });
          });
          return filteredResponse;
        },
        cache: false,
      },

      fullTextSearch: true
    });

  $('.menu a.label-filter-item').each(function () {
    $(this).on('click', function (e) {
      if (e.altKey) {
        e.preventDefault();

        const href = $(this).attr('href');
        const id = $(this).data('label-id');

        const regStr = `labels=(-?[0-9]+%2c)*(${id})(%2c-?[0-9]+)*&`;
        const newStr = 'labels=$1-$2$3&';

        window.location = href.replace(new RegExp(regStr), newStr);
      }
    });
  });

  $('.menu .ui.dropdown.label-filter').on('keydown', (e) => {
    if (e.altKey && e.keyCode === 13) {
      const selectedItems = $('.menu .ui.dropdown.label-filter .menu .item.selected');

      if (selectedItems.length > 0) {
        const item = $(selectedItems[0]);

        const href = item.attr('href');
        const id = item.data('label-id');

        const regStr = `labels=(-?[0-9]+%2c)*(${id})(%2c-?[0-9]+)*&`;
        const newStr = 'labels=$1-$2$3&';

        window.location = href.replace(new RegExp(regStr), newStr);
      }
    }
  });
}
window.cancelCodeComment = function (btn) {
  const form = $(btn).closest('form');
  if (form.length > 0 && form.hasClass('comment-form')) {
    form.addClass('hide');
    form.parent().find('button.comment-form-reply').show();
  } else {
    form.closest('.comment-code-cloud').remove();
  }
};

window.submitReply = function (btn) {
  const form = $(btn).closest('form');
  if (form.length > 0 && form.hasClass('comment-form')) {
    form.trigger('submit');
  }
};

window.onOAuthLoginClick = function () {
  const oauthLoader = $('#oauth2-login-loader');
  const oauthNav = $('#oauth2-login-navigator');

  oauthNav.hide();
  oauthLoader.removeClass('disabled');

  setTimeout(() => {
    // recover previous content to let user try again
    // usually redirection will be performed before this action
    oauthLoader.addClass('disabled');
    oauthNav.show();
  }, 5000);
};

// Pull SVGs via AJAX to workaround CORS issues with <use> tags
// https://css-tricks.com/ajaxing-svg-sprite/
$.get(`${window.config.StaticUrlPrefix}/img/svg/icons.svg`, (data) => {
  const div = document.createElement('div');
  div.style.display = 'none';
  div.innerHTML = new XMLSerializer().serializeToString(data.documentElement);
  document.body.insertBefore(div, document.body.childNodes[0]);
});
