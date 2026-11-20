import type { CampaignDetail } from '@/shared/api'

/**
 * Site integration code, as the Keitaro admin builds it on the campaign "Tracking" tab
 * (templates and macros copied from its bundle, Keitaro 10.3). KClient JS is left out:
 * Keitaro renders it on the server, and only for an admin session.
 */
export type IntegrationKind = 'tracking_script' | 'script' | 'php_redirect' | 'kclient_php'

export type Integration = {
  kind: IntegrationKind
  label: string
  /** Where the code goes. */
  hint: string
  code: string
}

const TRACKING_SCRIPT = `<!-- Keitaro tracking script -->
<script type='application/javascript'>
if (!window.KTracking){window.KTracking={collectNonUniqueClicks: false, multiDomain: false, R_PATH: '#internal_url#', P_PATH:'#postback_path#', listeners: [], reportConversion: function(){this.queued = arguments;}, getSubId: function(fn) {this.listeners.push(fn);}, ready: function(fn) {this.listeners.push(fn);} };}(function(){var a=document.createElement('script');a.type='application/javascript';a.async=true;a.src='#root_path#js/k.min.js';var s=document.getElementsByTagName('script')[0];s.parentNode.insertBefore(a,s)})();
</script><noscript><img height='0' width='0' alt='' src='#internal_url#'/></noscript>`

const SCRIPT_ASYNC = `<span id="#random_div_id#"></span><script type="application/javascript">
var d=document;var s=d.createElement('script');
s.src='#internal_url#&_cid=#random_div_id#&frm=script';
if (document.currentScript) {
document.currentScript.parentNode.insertBefore(s, document.currentScript);
} else {
d.getElementsByTagName('head')[0].appendChild(s);
}
if (document.location.protocol === 'https:' && '#internal_url#'.indexOf('http:') === 0 ) {alert('The website works on HTTPS. The tracker must use HTTPS too.');}
</script>`

const PHP_REDIRECT = `<?php header('Location: #internal_url#'); ?>`

const KCLIENT_PHP = `<?php
// Query params are: #params#

require_once dirname(__FILE__) . '/kclient.php';
$client = new KClient('#api_path#', '#token#');
$client->sendAllParams();       // to send all params from page query
$client->forceRedirectOffer();       // redirect to offer if an offer is chosen
// $client->param('sub_id_5', '123'); // you can send any params
// $client->keyword('PASTE_KEYWORD');  // send custom keyword
// $client->currentPageAsReferrer(); // to send current page URL as click referrer
// $client->disableSessions(); // to disable using session cookie (without this cookie restoreFromSession wouldn't work)
// $client->debug();              // to enable debug mode and show the errors
// $client->execute();             // request to api, show the output and continue
$client->executeAndBreak();     // to stop page execution if there is redirect or some output
?>`

// The script passes the referrer, the page title as keyword and the page query to the tracker
const JS_CLICK_PARAMS =
  "&se_referrer=' + encodeURIComponent(document.referrer) + '" +
  "&default_keyword=' + encodeURIComponent(document.title) + '" +
  "&'+window.location.search.replace('?', '&')+'"
const PHP_CLICK_PARAMS =
  "&' . http_build_query($_GET) . '" + "&se_referrer=' . urlencode($_SERVER['HTTP_REFERER']) . '"

/** A random id for the element the script output goes into, in Keitaro's format. */
export function randomDivId() {
  const part = () => (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1)
  return `${part()}${part()}-${part()}-${part()}-${part()}-${part()}${part()}${part()}`
}

function fill(template: string, macros: Record<string, string>) {
  // Unknown macros are dropped, as in Keitaro
  return template.replace(/#[a-z_]+#/g, (m) => macros[m] ?? '')
}

export function buildIntegrations(campaign: CampaignDetail, divId: string): Integration[] {
  const url = campaign.url
  const root = `${url.slice(0, url.length - campaign.alias.length).replace(/\/*$/, '')}/`
  const query = campaign.tracking_url.split('?')[1] ?? ''
  const macros = (internalUrl: string) => ({
    '#internal_url#': internalUrl,
    '#random_div_id#': divId,
    '#root_path#': root,
    '#postback_path#': campaign.postback_url ?? '',
    '#api_path#': root,
    '#alias#': campaign.alias,
    '#token#': campaign.token ?? '',
    '#params#': query,
  })

  const result: Integration[] = [
    {
      kind: 'tracking_script',
      label: 'Tracking Script',
      hint: 'Paste into <head> of the landing page. Conversions: KTracking.reportConversion(revenue, status).',
      code: fill(TRACKING_SCRIPT, macros(url)),
    },
    {
      kind: 'script',
      label: 'JS',
      hint: 'Paste where the campaign output should appear on the page.',
      code: fill(SCRIPT_ASYNC, macros(`${url}?${JS_CLICK_PARAMS}`)),
    },
    {
      kind: 'php_redirect',
      label: 'PHP redirect',
      hint: 'Put at the very top of a PHP page: visitors are redirected through the campaign.',
      code: fill(PHP_REDIRECT, macros(`${url}?${PHP_CLICK_PARAMS}`)),
    },
  ]
  if (campaign.token) {
    result.push({
      kind: 'kclient_php',
      label: 'KClient PHP',
      hint: 'Put at the top of a PHP page, next to kclient.php from the Keitaro admin.',
      code: fill(KCLIENT_PHP, macros(url)),
    })
  }
  return result
}
