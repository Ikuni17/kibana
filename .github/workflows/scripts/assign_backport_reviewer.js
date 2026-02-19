/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// @ts-check

// @ts-ignore -- installed at CI runtime via workflow step, not present in workspace
const { parse, matchFile } = require('codeowners-utils');

/** @typedef {{ filename: string }} PullsListFile */

/** @typedef {{ owner: string, repo: string, pull_number: number, per_page: number }} ListFilesParams */

/**
 * @typedef {{
 *   organization: {
 *     teams: {
 *       nodes: Array<{ slug: string }>
 *     }
 *   }
 * }} OrgTeamsResponse
 */

/**
 * @typedef {{
 *   rest: {
 *     pulls: {
 *       listFiles: (params: ListFilesParams) => Promise<{ data: PullsListFile[] }>,
 *       requestReviewers: (params: { owner: string, repo: string, pull_number: number, team_reviewers: string[] }) => Promise<void>,
 *       removeRequestedReviewers: (params: { owner: string, repo: string, pull_number: number, reviewers: string[] }) => Promise<void>,
 *     },
 *     repos: {
 *       getContent: (params: { owner: string, repo: string, path: string, ref: string }) => Promise<{ data: { content: string } }>,
 *     },
 *   },
 *   paginate: (method: (params: ListFilesParams) => Promise<{ data: PullsListFile[] }>, params: ListFilesParams, mapper: (response: { data: PullsListFile[] }) => string[]) => Promise<string[]>,
 *   graphql: (query: string, variables: { login: string }) => Promise<OrgTeamsResponse>,
 * }} GitHubClient
 *
 * @typedef {{
 *   info: (message: string) => void,
 *   warning: (message: string) => void,
 * }} ActionsCore
 *
 * @typedef {{
 *   repo: { owner: string, repo: string },
 *   payload: {
 *     pull_request: {
 *       number: number,
 *       user: { login: string },
 *     },
 *   },
 * }} ActionsContext
 */

/** @param {{ github: GitHubClient, core: ActionsCore, context: ActionsContext }} params */
module.exports = async ({ github, core, context }) => {
  const { owner, repo } = context.repo;
  const prNumber = context.payload.pull_request.number;
  const author = context.payload.pull_request.user.login;

  const [changedFiles, { data: codeownersFile }] = await Promise.all([
    github.paginate(
      github.rest.pulls.listFiles,
      { owner, repo, pull_number: prNumber, per_page: 100 },
      (response) => response.data.map((file) => file.filename)
    ),
    github.rest.repos.getContent({
      owner,
      repo,
      path: '.github/CODEOWNERS',
      ref: 'main',
    }),
  ]);

  if (changedFiles.length === 0) {
    core.info('No changed files found');
    return;
  }

  core.info(`Found ${changedFiles.length} changed file(s)`);

  const codeownersContent = Buffer.from(codeownersFile.content, 'base64').toString('utf8');
  const entries = parse(codeownersContent);

  const codeownerTeams = new Set();
  for (const file of changedFiles) {
    const match = matchFile(file, entries);
    if (match) {
      for (const fileOwner of match.owners) {
        if (fileOwner.startsWith('@elastic/')) {
          codeownerTeams.add(fileOwner.replace('@elastic/', ''));
        }
      }
    }
  }

  if (codeownerTeams.size === 0) {
    core.info('No CODEOWNERS teams matched the changed files');
    return;
  }

  core.info(`CODEOWNERS matched teams: ${[...codeownerTeams].join(', ')}`);

  let authorTeams;
  try {
    const result = await github.graphql(
      `query($login: String!) {
        organization(login: "elastic") {
          teams(first: 100, userLogins: [$login]) {
            nodes { slug }
          }
        }
      }`,
      { login: author }
    );
    authorTeams = result.organization.teams.nodes.map((t) => t.slug);
  } catch (error) {
    core.warning(`Failed to query author's org teams: ${error.message}`);
    return;
  }

  core.info(`Author ${author} belongs to teams: ${authorTeams.join(', ')}`);

  const authorTeamSet = new Set(authorTeams);
  const teamsToAdd = [...codeownerTeams].filter((t) => authorTeamSet.has(t));

  if (teamsToAdd.length === 0) {
    core.info(
      'No overlap between author teams and CODEOWNERS teams, leaving kibanamachine as reviewer'
    );
    return;
  }

  core.info(`Assigning team reviewers: ${teamsToAdd.join(', ')}`);

  const results = await Promise.allSettled([
    github.rest.pulls.requestReviewers({
      owner,
      repo,
      pull_number: prNumber,
      team_reviewers: teamsToAdd,
    }),
    github.rest.pulls.removeRequestedReviewers({
      owner,
      repo,
      pull_number: prNumber,
      reviewers: ['kibanamachine'],
    }),
  ]);

  const [addResult, removeResult] = results;
  if (addResult.status === 'rejected') {
    core.warning(`Failed to add team reviewers: ${addResult.reason}`);
  }
  if (removeResult.status === 'rejected') {
    core.info('kibanamachine was not a requested reviewer, nothing to remove');
  }
};
