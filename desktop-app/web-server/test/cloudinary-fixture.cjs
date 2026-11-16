function cloudinaryFixture() {
  const assets=new Map(),uploads=[],downloads=[]
  const fixture={assets,uploads,downloads,failDownloads:false,failUploads:false}
  fixture.env={CLOUDINARY_CLOUD_NAME:'ixqbuvsd',CLOUDINARY_API_KEY:'test-key',CLOUDINARY_API_SECRET:'test-secret'}
  fixture.client={
    uploader:{upload_stream(options,callback){return {end(bytes){
      if(fixture.failUploads)return callback(new Error('Upload unavailable'))
      uploads.push(options);assets.set(options.public_id,Buffer.from(bytes))
      callback(null,{public_id:options.public_id,type:options.type,resource_type:options.resource_type,bytes:bytes.length,asset_id:'test-asset'})
    }}}},
    utils:{private_download_url(id,format,options){downloads.push({id,format,options});return 'https://api.cloudinary.com/test-download?id='+encodeURIComponent(id)}},
  }
  fixture.fetcher=async url=>fixture.failDownloads?new Response('Unavailable',{status:403}):new Response(assets.get(new URL(url).searchParams.get('id')),{status:200})
  return fixture
}
module.exports={cloudinaryFixture}
