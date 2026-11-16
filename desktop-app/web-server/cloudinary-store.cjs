const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const checksum = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const safeRelative = value => typeof value === 'string' && value && !value.includes('\\') && !path.isAbsolute(value) && !value.split('/').some(part => !part || part === '.' || part === '..') && !value.includes('school.sqlite')

function filesIn(root) {
  const files = new Map()
  function visit(directory) {
    for (const item of fs.readdirSync(directory,{withFileTypes:true})) {
      const filename=path.join(directory,item.name)
      if(item.isDirectory())visit(filename)
      else if(item.isFile()&&!filename.includes('school.sqlite')) {
        const relative=path.relative(root,filename).split(path.sep).join('/')
        files.set(relative,{filename,sha256:checksum(fs.readFileSync(filename))})
      }
    }
  }
  visit(root);return files
}

function createCloudinaryStore({env=process.env,client,fetcher=fetch}={}) {
  const cloudName=env.CLOUDINARY_CLOUD_NAME||'ixqbuvsd'
  const configured=Boolean(env.CLOUDINARY_CLOUD_NAME&&env.CLOUDINARY_API_KEY&&env.CLOUDINARY_API_SECRET)
  let sdk=client
  function api() {
    if(!configured)throw new Error('Cloudinary is not configured. Ask the administrator to set the three Cloudinary variables in Render.')
    if(!sdk){sdk=require('cloudinary').v2;sdk.config({cloud_name:cloudName,api_key:env.CLOUDINARY_API_KEY,api_secret:env.CLOUDINARY_API_SECRET,secure:true,signature_algorithm:'sha256'})}
    return sdk
  }
  function validate(reference) {
    if(!reference||reference.cloudName!==cloudName||reference.resourceType!=='raw'||reference.deliveryType!=='authenticated'||!/^olufunmilayo\/(logos|photos|receipts|resources|documents|files)\/[a-f0-9]{64}\.[a-z0-9]+$/.test(reference.publicId)||!Number.isSafeInteger(reference.bytes)||reference.bytes<1||reference.bytes>100*1024*1024||!/^[a-f0-9]{64}$/.test(reference.sha256)) throw new Error('Invalid Cloudinary school file reference.')
  }
  async function read(reference) {
    validate(reference)
    const url=api().utils.private_download_url(reference.publicId,'',{resource_type:'raw',type:'authenticated',expires_at:Math.floor(Date.now()/1000)+60,secure:true})
    if(new URL(url).origin!=='https://api.cloudinary.com')throw new Error('Invalid Cloudinary download address.')
    try {
      const response=await fetcher(url,{signal:AbortSignal.timeout(45000)})
      if(!response.ok||!response.body)throw new Error('Download failed')
      const chunks=[];let size=0
      for await(const chunk of response.body){size+=chunk.length;if(size>reference.bytes)throw new Error('File length mismatch');chunks.push(Buffer.from(chunk))}
      const bytes=Buffer.concat(chunks)
      if(bytes.length!==reference.bytes||checksum(bytes)!==reference.sha256)throw new Error('Checksum mismatch')
      return bytes
    } catch {throw new Error('The protected school file could not be downloaded or verified from Cloudinary. Ask the administrator to check Cloudinary access and delivery settings.')}
  }
  async function store(filename,relative) {
    if(!safeRelative(relative))throw new Error('Invalid school file path.')
    const bytes=fs.readFileSync(filename),sha256=checksum(bytes)
    const extension=path.extname(filename).slice(1).toLowerCase()
    if(!/^[a-z0-9]{1,10}$/.test(extension))throw new Error('The uploaded file must have a supported extension.')
    const category=relative.startsWith('branding/')?'logos':relative.startsWith('payment-receipts/')?'receipts':relative.startsWith('resources/')?'resources':relative.startsWith('uploads/')?'photos':'files'
    const publicId=`olufunmilayo/${category}/${sha256}.${extension}`
    try {
      const uploaded=await new Promise((resolve,reject)=>{
        const stream=api().uploader.upload_stream({resource_type:'raw',type:'authenticated',public_id:publicId,asset_folder:`olufunmilayo/${category}`,overwrite:false,unique_filename:false,timeout:60000},(error,result)=>error?reject(error):resolve(result))
        stream.end(bytes)
      })
      if(uploaded.public_id!==publicId||uploaded.type!=='authenticated'||uploaded.resource_type!=='raw'||Number(uploaded.bytes)!==bytes.length)throw new Error('Unexpected upload response')
      const reference={cloudName,publicId,resourceType:'raw',deliveryType:'authenticated',sha256,bytes:bytes.length,assetId:uploaded.asset_id||null}
      const verified=await read(reference)
      if(checksum(verified)!==sha256)throw new Error('Upload verification failed')
      return reference
    } catch {throw new Error('Cloudinary upload or verification failed. The existing school files were retained. Check the cloud name, API credentials, file limits and protected file delivery settings in Cloudinary.')}
  }
  async function hydrate(root,relative,references) {
    if(!safeRelative(relative))throw new Error('Invalid school file path.')
    const destination=path.join(root,...relative.split('/'))
    if(fs.existsSync(destination))return
    const reference=references[relative]
    if(!reference)throw new Error('This school file is missing from storage.')
    const bytes=await read(reference)
    fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,bytes)
  }
  async function persist(root,references,before,{all=false}={}) {
    const next={...references};let migrated=0
    for(const [relative,item] of filesIn(root)) {
      if(next[relative]?.sha256===item.sha256)continue
      if(!all&&before.get(relative)?.sha256===item.sha256)continue
      next[relative]=await store(item.filename,relative);migrated++
    }
    return {references:next,migrated}
  }
  return {configured,cloudName,read,store,hydrate,persist,filesIn,validate}
}
module.exports={createCloudinaryStore,filesIn,safeRelative}
